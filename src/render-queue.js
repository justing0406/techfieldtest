import { ensureSchema } from './jobs.js';
const now = () => new Date().toISOString();
export async function claimRender(env) {
  await ensureSchema(env.DB);
  const lease = crypto.randomUUID(), until = new Date(Date.now() + 45 * 60000).toISOString();
  // Stale leases are reclaimable. The old worker cannot upload or complete against
  // the replacement lease. Third failed attempt becomes a visible terminal failure.
  await env.DB.batch([
    env.DB.prepare("UPDATE render_runs SET status='failed',error='Render worker exhausted three attempts.',updated_at=? WHERE status='leased' AND lease_until<? AND attempts>=3").bind(now(), now()),
    env.DB.prepare("UPDATE videos SET status='failed',error='Rendering exhausted three attempts.',updated_at=? WHERE id IN (SELECT video_id FROM render_runs WHERE status='failed') AND status='rendering'").bind(now()),
  ]);
  const row = await env.DB.prepare(`UPDATE render_runs SET status='leased', lease_id=?, lease_until=?, attempts=attempts+1,
    upload_key=NULL, error=NULL, updated_at=? WHERE video_id=(
      SELECT r.video_id FROM render_runs r JOIN videos v ON v.id=r.video_id
      WHERE v.status='rendering' AND (r.status='pending' OR (r.status='leased' AND r.lease_until<?)) AND r.attempts<3
      ORDER BY r.created_at LIMIT 1
    ) RETURNING *`).bind(lease, until, now(), now()).first();
  if (!row) return { job: null };
  const run = await env.DB.prepare('SELECT script_key FROM production_runs WHERE video_id=?').bind(row.video_id).first();
  const object = run?.script_key && await env.ASSETS.get(run.script_key);
  if (!object) throw { code: 409, message: 'Render script is unavailable.' };
  const script = await object.json();
  if (!script.plan) throw { code: 409, message: 'This draft does not have a renderable scene plan.' };
  return { job: { videoId: row.video_id, leaseId: lease, leaseUntil: until, plan: script.plan,
    title: script.title, selectedConcept: script.selectedConcept, attempt: row.attempts } };
}
export async function currentLease(env, id, lease) {
  if (typeof lease !== 'string' || lease.length !== 36) throw { code: 400, message: 'Render lease required.' };
  const row = await env.DB.prepare('SELECT * FROM render_runs WHERE video_id=?').bind(id).first();
  if (!row || row.status !== 'leased' || row.lease_id !== lease || row.lease_until <= now()) throw { code: 409, message: 'Render lease expired or was replaced.' };
  return row;
}
export async function uploadRender(env, id, kind, request) {
  const lease = request.headers.get('x-render-lease');
  await currentLease(env, id, lease);
  const max = kind === 'video' ? 50 * 1024 * 1024 : 2 * 1024 * 1024;
  // Trusted runner sends a known Content-Length; rejecting chunked/unbounded data
  // limits memory and bucket consumption even if a workflow is misconfigured.
  const size = Number(request.headers.get('content-length'));
  if (!Number.isInteger(size) || size < (kind === 'video' ? 10000 : 100) || size > max) throw { code: 413, message: 'Invalid render asset size.' };
  const body = await request.arrayBuffer();
  if (body.byteLength !== size) throw { code: 400, message: 'Upload length mismatch.' };
  const bytes = new Uint8Array(body);
  if (kind === 'video' && new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp') throw { code: 400, message: 'Expected an MP4 file.' };
  if (kind === 'poster' && !(bytes[0] === 255 && bytes[1] === 216)) throw { code: 400, message: 'Expected a JPEG poster.' };
  const key = 'jobs/' + id + '/renders/' + lease + '/' + (kind === 'video' ? 'video.mp4' : 'poster.jpg');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(x => x.toString(16).padStart(2, '0')).join('');
  await env.ASSETS.put(key, body, { httpMetadata: { contentType: kind === 'video' ? 'video/mp4' : 'image/jpeg' }, customMetadata: { sha256 } });
  // A superseded lease can leave an unreferenced object, but cannot replace the
  // current asset or make it visible in the dashboard.
  if (kind === 'video') await env.DB.prepare("UPDATE render_runs SET upload_key=? WHERE video_id=? AND status='leased' AND lease_id=?").bind(key, id, lease).run();
  return { saved: true, size };
}
export async function finishRender(env, id, data) {
  const lease = data.leaseId;
  const existing = await env.DB.prepare('SELECT * FROM render_runs WHERE video_id=?').bind(id).first();
  if (existing?.status === 'complete' && existing.lease_id === lease) return { complete: true, reused: true };
  const row = await currentLease(env, id, lease);
  const q = data.qa;
  if (!q || q.version !== 1 || q.passed !== true || q.width !== 1080 || q.height !== 1920 || q.fps !== 30 ||
    q.videoCodec !== 'h264' || q.audioCodec !== 'aac' || q.decoded !== true || q.captionBoundsChecked !== true ||
    !Number.isFinite(q.durationSeconds) || q.durationSeconds < 20 || q.durationSeconds > 45 ||
    !Number.isFinite(q.integratedLufs) || q.integratedLufs < -18 || q.integratedLufs > -14 ||
    !Number.isFinite(q.truePeakDb) || q.truePeakDb > -1 || !/^[0-9a-f]{64}$/.test(q.sha256 || '')) {
    throw { code: 400, message: 'Render failed technical quality checks.' };
  }
  const prefix = 'jobs/' + id + '/renders/' + lease + '/';
  const videoKey = prefix + 'video.mp4', posterKey = prefix + 'poster.jpg', qaKey = prefix + 'qa.json';
  const video = await env.ASSETS.head(videoKey);
  if (row.upload_key !== videoKey || !video || !await env.ASSETS.head(posterKey)) throw { code: 409, message: 'Upload the video and poster before completing the render.' };
  if (video.customMetadata?.sha256 !== q.sha256) throw { code: 400, message: 'Quality report does not match the uploaded video.' };
  await env.ASSETS.put(qaKey, JSON.stringify({ ...q, videoId: id, createdAt: now(), scope: 'Technical checks only. Factual interpretation and entertainment require preview.' }), { httpMetadata: { contentType: 'application/json' } });
  await env.DB.batch([
    env.DB.prepare("UPDATE render_runs SET status='complete',video_key=?,poster_key=?,qa_key=?,error=NULL,updated_at=? WHERE video_id=? AND status='leased' AND lease_id=? AND lease_until>?")
      .bind(videoKey, posterKey, qaKey, now(), id, lease, now()),
    env.DB.prepare("UPDATE videos SET status='awaiting_approval',error=NULL,updated_at=? WHERE id=? AND status='rendering' AND EXISTS(SELECT 1 FROM render_runs WHERE video_id=? AND status='complete' AND lease_id=?)").bind(now(), id, id, lease),
  ]);
  const final = await env.DB.prepare('SELECT status,lease_id FROM render_runs WHERE video_id=?').bind(id).first();
  if (final.status !== 'complete' || final.lease_id !== lease) throw { code: 409, message: 'Render lease changed before completion.' };
  return { complete: true, videoUrl: '/api/videos/' + id + '/video' };
}
export async function failRender(env, id, data) {
  const row = await currentLease(env, id, data.leaseId), error = String(data.error || 'Render failed').slice(0, 400), terminal = row.attempts >= 3;
  await env.DB.batch([
    env.DB.prepare("UPDATE render_runs SET status=?,error=?,lease_until=NULL,updated_at=? WHERE video_id=? AND status='leased' AND lease_id=?").bind(terminal ? 'failed' : 'pending', error, now(), id, data.leaseId),
    env.DB.prepare("UPDATE videos SET status=?,error=?,updated_at=? WHERE id=? AND status='rendering' AND EXISTS(SELECT 1 FROM render_runs WHERE video_id=? AND lease_id=? AND status=?)")
      .bind(terminal ? 'failed' : 'rendering', error, now(), id, id, data.leaseId, terminal ? 'failed' : 'pending'),
  ]);
  return { retryable: !terminal };
}

export async function serveMedia(env, id, kind, request) {
  const row = await env.DB.prepare('SELECT * FROM render_runs WHERE video_id=? AND status=?').bind(id, 'complete').first();
  const key = row?.[{ video: 'video_key', poster: 'poster_key', qa: 'qa_key' }[kind]];
  if (!key) return new Response('Not ready', { status: 404 });
  const head = await env.ASSETS.head(key);
  if (!head) return new Response('Not available', { status: 404 });
  const headers = { 'content-type': kind === 'video' ? 'video/mp4' : kind === 'poster' ? 'image/jpeg' : 'application/json',
    'accept-ranges': 'bytes', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff', etag: head.httpEtag };
  let range;
  if (kind === 'video' && request.headers.has('range')) {
    const match = request.headers.get('range').match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + head.size } });
    const start = match[1] ? Number(match[1]) : Math.max(0, head.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
    if (start > end || start >= head.size || (!match[1] && Number(match[2]) === 0)) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + head.size } });
    range = { offset: start, length: end - start + 1 }; headers['content-range'] = `bytes ${start}-${end}/${head.size}`;
  }
  headers['content-length'] = String(range?.length || head.size);
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const object = await env.ASSETS.get(key, range ? { range } : {});
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
