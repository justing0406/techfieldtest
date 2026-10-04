import initialSchema from '../migrations/0001_jobs.sql';
import productionSchema from '../migrations/0002_production.sql';
import dailySchema from '../migrations/0003_daily.sql';

const initialized = new WeakMap();
export const DEFAULT_TOPIC = 'Which free meeting note taker fits your meetings?';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Bootstrap the additive initial schema on first use, including deployments that
// run `wrangler deploy` directly. Later schema changes use versioned migrations.
export async function ensureSchema(db) {
  if (!initialized.has(db)) {
    const pending = db.batch((initialSchema + '\n' + productionSchema + '\n' + dailySchema).split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
    initialized.set(db, pending);
    pending.catch(() => initialized.delete(db));
  }
  await initialized.get(db);
}

export function presentVideo(row) {
  return {
    id: row.id, topic: row.topic, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    error: row.error,
    briefUrl: '/api/videos/' + row.id + '/brief',
    researchUrl: row.research_key ? '/api/videos/' + row.id + '/research' : null,
    scriptUrl: row.script_key ? '/api/videos/' + row.id + '/script' : null,
    productionStatus: row.production_status || null,
    renderStatus: row.render_status || null,
    videoUrl: row.video_key ? '/api/videos/' + row.id + '/video' : null,
    posterUrl: row.poster_key ? '/api/videos/' + row.id + '/poster' : null,
    qaUrl: row.qa_key ? '/api/videos/' + row.id + '/qa' : null,
    review: row.review || null,
    reviewNote: row.review_note || null,
    dailyDay: row.day || null,
  };
}

export async function listVideos(env) {
  await ensureSchema(env.DB);
  // Today follows the owner's timezone, including daylight saving changes.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const { results } = await env.DB.prepare(`SELECT v.*, p.research_key, p.script_key, p.status AS production_status,
    r.status AS render_status, r.video_key, r.poster_key, r.qa_key, r.review, r.review_note, d.day
    FROM videos v LEFT JOIN production_runs p ON p.video_id = v.id
    LEFT JOIN render_runs r ON r.video_id = v.id LEFT JOIN daily_slots d ON d.video_id = v.id
    ORDER BY v.created_at DESC, v.id DESC LIMIT 100`).all();
  const counts = await env.DB.prepare(`SELECT
    COALESCE(SUM(status = 'awaiting_approval'), 0) AS awaitingApproval,
    COALESCE(SUM(status = 'published'), 0) AS published,
    COALESCE(SUM(status IN ('creating', 'queued', 'researching', 'scripting', 'rendering')), 0) AS queued,
    COUNT(*) AS total
    FROM videos`).first();
  // Count all today's jobs; the visible queue is intentionally capped at 100.
  const { results: dates } = await env.DB.prepare('SELECT created_at FROM videos WHERE created_at >= ?').bind(today + 'T00:00:00.000Z').all();
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const videosToday = dates.filter(row => format.format(new Date(row.created_at)) === today).length;
  return { summary: { ...counts, videosToday }, videos: results.map(presentVideo) };
}

export async function createVideo(env, id, topic, sourceUrls = [], parentVideoId = null, creativeBrief = null) {
  await ensureSchema(env.DB);
  const now = new Date().toISOString();
  const manifestKey = 'jobs/' + id + '/brief.json';
  const inserted = await env.DB.prepare(`INSERT INTO videos (id, topic, status, manifest_key, created_at, updated_at)
    VALUES (?, ?, 'creating', ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(id, topic, manifestKey, now, now).run();
  if (!inserted.meta.changes) {
    const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
    if (row.topic !== topic) return { code: 409, error: 'This request ID belongs to a different topic. Start a new job.' };
    if (row.status === 'creating') return { code: 409, error: 'This job is still being saved. Retry shortly using the same request ID.' };
    if (row.status === 'failed') return { code: 409, error: 'This job failed. Start a new job to retry.', video: presentVideo(row) };
    const existingBrief = await env.ASSETS.get(row.manifest_key);
    if (existingBrief) {
      const brief = await existingBrief.json();
      if (brief.sourceUrls && JSON.stringify(brief.sourceUrls) !== JSON.stringify(sourceUrls)) return { code: 409, error: 'This request ID belongs to different sources. Start a new job.' };
      if ((brief.parentVideoId || null) !== parentVideoId) return { code: 409, error: 'This request ID belongs to a different draft revision.' };
    }
    return { code: 200, video: presentVideo(row), reused: true };
  }

  try {
    await env.ASSETS.put(manifestKey, JSON.stringify({
      version: 3, id, topic, sourceUrls, parentVideoId, createdAt: now,
      format: { width: 1080, height: 1920, durationSeconds: 40 },
      platforms: ['youtube_shorts', 'instagram_reels', 'tiktok'],
      approvalRequired: true,
      stages: ['research', 'script', 'fact_check', 'voice', 'visuals', 'render', 'human_approval'],
      evidence: [],
      creativeBrief,
      notes: 'Research uses published sources. Rendered scenes are illustrations, not physical tests. Test claims require recorded evidence.',
    }, null, 2), { httpMetadata: { contentType: 'application/json' } });
    await env.DB.prepare("UPDATE videos SET status = 'queued', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  } catch (error) {
    console.error('Job persistence failed', id, error);
    // Retain the row for visibility. A manifest may exist if the final D1 write failed.
    await env.DB.prepare("UPDATE videos SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind('Could not save this job completely. Create a new job to retry.', new Date().toISOString(), id).run();
    const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
    return { code: 503, error: 'Could not save this job completely. Create a new job to retry.', video: presentVideo(row) };
  }
  const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
  return { code: 201, video: presentVideo(row), reused: false };
}
