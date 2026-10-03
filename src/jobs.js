import initialSchema from '../migrations/0001_jobs.sql';

const initialized = new WeakMap();
export const DEFAULT_TOPIC = 'Compare AI meeting note takers using the same recorded meeting';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Bootstrap the additive initial schema on first use, including deployments that
// run `wrangler deploy` directly. Later schema changes use versioned migrations.
export async function ensureSchema(db) {
  if (!initialized.has(db)) {
    const pending = db.batch(initialSchema.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
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
  };
}

export async function listVideos(env) {
  await ensureSchema(env.DB);
  // Today follows the owner's timezone, including daylight saving changes.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const { results } = await env.DB.prepare('SELECT * FROM videos ORDER BY created_at DESC, id DESC LIMIT 100').all();
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

export async function createVideo(env, id, topic) {
  await ensureSchema(env.DB);
  const now = new Date().toISOString();
  const manifestKey = 'jobs/' + id + '/brief.json';
  const inserted = await env.DB.prepare(`INSERT INTO videos (id, topic, status, manifest_key, created_at, updated_at)
    VALUES (?, ?, 'creating', ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(id, topic, manifestKey, now, now).run();
  if (!inserted.meta.changes) {
    const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
    if (row.topic !== topic) return { code: 409, error: 'This request ID belongs to a different topic. Start a new job.' };
    if (row.status === 'creating') return { code: 409, error: 'This job is still being saved. Retry shortly using the same request ID.' };
    if (row.status === 'failed') return { code: 409, error: 'This job failed to save. Start a new job to retry.', video: presentVideo(row) };
    return { code: 200, video: presentVideo(row), reused: true };
  }

  try {
    await env.ASSETS.put(manifestKey, JSON.stringify({
      version: 1, id, topic, createdAt: now,
      format: { width: 1080, height: 1920, durationSeconds: 40 },
      platforms: ['youtube_shorts', 'instagram_reels', 'tiktok'],
      approvalRequired: true,
      stages: ['research', 'script', 'fact_check', 'voice', 'visuals', 'render', 'human_approval'],
      evidence: [],
      notes: 'Job brief only. Research, narration and rendering have not run. Claims of hands-on testing require recorded test evidence.',
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
