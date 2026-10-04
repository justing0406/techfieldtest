import { dashboardHtml } from './dashboard.js';
import { createVideo, DEFAULT_TOPIC, ensureSchema, listVideos, UUID } from './jobs.js';
import { selectSources, refreshedSources } from './sources.js';
import { startProduction } from './workflow.js';
import { dailyStatus, runDaily } from './daily.js';
import { verifyRenderer, requireOwner } from './render-auth.js';
import { claimRender, uploadRender, finishRender, failRender, serveMedia } from './render-queue.js';
export { ProductionWorkflow } from './workflow.js';

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

async function readBody(request) {
  if (!request.body) return {};
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw { code: 415, message: 'Use application/json for the request body.' };
  }
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); throw { code: 413, message: 'Request body is too large.' }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return {};
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(body));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw { code: 400, message: 'Request body must be a JSON object.' }; }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env, new Date(event.scheduledTime)).catch(error => console.error('Daily production failed', error)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(dashboardHtml, { headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
      } });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      const storage = { d1: Boolean(env.DB), r2: Boolean(env.ASSETS) };
      try {
        if (!storage.d1 || !storage.r2) throw new Error('Missing bindings');
        await ensureSchema(env.DB);
        await env.ASSETS.head('__health_probe__');
        return json({ status: 'ok', service: 'techfieldtest', version: '0.5.0', storage,
          pipeline: { ai: Boolean(env.AI), workflow: Boolean(env.PRODUCTION), daily: env.DAILY_ENABLED === 'true',
            renderer: Boolean(env.RENDER_REPOSITORY_ID), publishing: false, analytics: false }, timestamp: new Date().toISOString() });
      } catch (error) {
        console.error('Storage health check failed', error);
        return json({ status: 'degraded', service: 'techfieldtest', version: '0.5.0', storage,
          message: 'Storage is not ready. Check the Cloudflare build logs and DB / ASSETS bindings.' }, 503);
      }
    }

    const isList = url.pathname === '/api/videos' && request.method === 'GET';
    const isCreate = url.pathname === '/api/generate' && request.method === 'POST';
    const artifactMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/(brief|research|script)$/);
    const isArtifact = artifactMatch && request.method === 'GET';
    const startMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/start$/);
    const isStart = startMatch && request.method === 'POST';
    const regenerateMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/regenerate$/);
    const isRegenerate = regenerateMatch && request.method === 'POST';
    const isDaily = url.pathname === '/api/daily' && request.method === 'GET';
    const isDailyRun = url.pathname === '/api/daily/run' && request.method === 'POST';
    const mediaMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/(video|poster|qa)$/);
    const isMedia = mediaMatch && ['GET','HEAD'].includes(request.method);
    const reviewMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/review$/);
    const isReview = reviewMatch && request.method === 'POST';
    const isRenderer = url.pathname.startsWith('/api/renderer/');
    if (!isList && !isCreate && !isArtifact && !isStart && !isRegenerate && !isDaily && !isDailyRun && !isMedia && !isReview && !isRenderer) return json({ error: 'Not found' }, 404);
    if (isCreate || isStart || isRegenerate || isDailyRun || isReview) {
      const origin = request.headers.get('origin');
      if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        return json({ error: 'Cross-site job creation is not allowed.' }, 403);
      }
    }
    if (!env.DB || !env.ASSETS) return json({ error: 'Storage is not ready. Check the Cloudflare build logs and DB / ASSETS bindings.' }, 503);

    try {
      if (isDaily) return json(await dailyStatus(env));
      if (isDailyRun) return json(await runDaily(env, new Date(), true), 202);
      if (isMedia) {
        if (!UUID.test(mediaMatch[1])) return json({ error: 'Not found' }, 404);
        await ensureSchema(env.DB);
        return serveMedia(env, mediaMatch[1].toLowerCase(), mediaMatch[2], request);
      }
      if (isReview) {
        requireOwner(request, env);
        if (!UUID.test(reviewMatch[1])) return json({ error: 'Not found' }, 404);
        const body = await readBody(request);
        if (!['approved','rejected'].includes(body.decision) || typeof body.note !== 'string' || body.note.length > 500) return json({ error: 'Choose approved or rejected and a note up to 500 characters.' }, 400);
        await ensureSchema(env.DB);
        const id = reviewMatch[1].toLowerCase(), now = new Date().toISOString();
        const row = await env.DB.prepare('SELECT * FROM render_runs WHERE video_id=?').bind(id).first();
        if (!row || row.status !== 'complete' || !row.video_key) return json({ error: 'Review the finished MP4 before approval.' }, 409);
        await env.DB.batch([
          env.DB.prepare('UPDATE render_runs SET review=?,review_note=?,updated_at=? WHERE video_id=? AND status=?').bind(body.decision, body.note, now, id, 'complete'),
          env.DB.prepare('UPDATE videos SET status=?,error=?,updated_at=? WHERE id=?').bind(body.decision === 'approved' ? 'approved' : 'failed', body.decision === 'rejected' ? body.note || 'Rejected in final review.' : null, now, id),
        ]);
        return json({ reviewed: true, decision: body.decision, published: false });
      }
      if (isRenderer) {
        await verifyRenderer(request, env);
        await ensureSchema(env.DB);
        if (url.pathname === '/api/renderer/daily' && request.method === 'POST') return json(await runDaily(env));
        if (url.pathname === '/api/renderer/claim' && request.method === 'POST') return json(await claimRender(env));
        const match = url.pathname.match(/^\/api\/renderer\/([^/]+)\/(video|poster|complete|fail)$/);
        if (!match || !UUID.test(match[1])) return json({ error: 'Not found' }, 404);
        if (['video','poster'].includes(match[2]) && request.method === 'PUT') return json(await uploadRender(env, match[1], match[2], request));
        if (match[2] === 'complete' && request.method === 'POST') return json(await finishRender(env, match[1], await readBody(request)));
        if (match[2] === 'fail' && request.method === 'POST') return json(await failRender(env, match[1], await readBody(request)));
        return json({ error: 'Not found' }, 404);
      }
      if (isList) return json(await listVideos(env));
      if (isRegenerate) {
        if (!UUID.test(regenerateMatch[1])) return json({ error: 'Not found' }, 404);
        const parentId = regenerateMatch[1].toLowerCase();
        await ensureSchema(env.DB);
        const parent = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(parentId).first();
        if (!parent) return json({ error: 'Job not found.' }, 404);
        if (!['awaiting_approval', 'failed'].includes(parent.status)) return json({ error: 'Wait for the current draft to finish before regenerating.' }, 409);
        const briefObject = await env.ASSETS.get(parent.manifest_key);
        if (!briefObject) return json({ error: 'Original brief is unavailable.' }, 409);
        const brief = await briefObject.json();
        const id = request.headers.get('Idempotency-Key') || crypto.randomUUID();
        if (!UUID.test(id)) return json({ error: 'Idempotency-Key must be a version 4 UUID.' }, 400);
        let sources;
        try { sources = refreshedSources(parent.topic, brief.sourceUrls); }
        catch (error) { return json({ error: error.message }, 400); }
        const review = await env.DB.prepare('SELECT review_note FROM render_runs WHERE video_id=?').bind(parentId).first();
        const creativeBrief = brief.creativeBrief ? { ...brief.creativeBrief, revisionFeedback: review?.review_note || parent.error || '', previousDraftId: parentId } : null;
        const result = await createVideo(env, id.toLowerCase(), parent.topic, sources, parentId, creativeBrief);
        if (result.error) return json({ error: result.error }, result.code);
        let pipeline;
        try { pipeline = await startProduction(env, result.video.id); }
        catch (error) { pipeline = { started: false, error: error.message, code: error.code || 503 }; }
        return json({ video: result.video, reused: result.reused, pipeline, parentVideoId: parentId,
          message: pipeline.error || (pipeline.started ? 'A new draft is being generated. Your previous script is preserved.' : pipeline.message) }, result.code);
      }
      if (isStart) {
        if (!UUID.test(startMatch[1])) return json({ error: 'Not found' }, 404);
        return json(await startProduction(env, startMatch[1].toLowerCase()), 202);
      }
      if (isArtifact) {
        if (!UUID.test(artifactMatch[1])) return json({ error: 'Not found' }, 404);
        await ensureSchema(env.DB);
        const row = await env.DB.prepare(`SELECT v.manifest_key, p.research_key, p.script_key
          FROM videos v LEFT JOIN production_runs p ON p.video_id = v.id WHERE v.id = ?`).bind(artifactMatch[1].toLowerCase()).first();
        if (!row) return json({ error: 'Not found' }, 404);
        const key = row[{ brief: 'manifest_key', research: 'research_key', script: 'script_key' }[artifactMatch[2]]];
        if (!key) return json({ error: 'This artifact is not ready yet.' }, 404);
        const object = await env.ASSETS.get(key);
        if (!object) return json({ error: 'This artifact is not available for this job.' }, 404);
        return new Response(object.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }
      const body = await readBody(request);
      const topic = body.topic === undefined ? DEFAULT_TOPIC : body.topic;
      if (typeof topic !== 'string' || !topic.trim() || topic.trim().length > 240) {
        return json({ error: 'Enter a topic between 1 and 240 characters.' }, 400);
      }
      const id = request.headers.get('Idempotency-Key') || crypto.randomUUID();
      if (!UUID.test(id)) return json({ error: 'Idempotency-Key must be a version 4 UUID.' }, 400);
      await ensureSchema(env.DB);
      const existing = await env.DB.prepare('SELECT topic FROM videos WHERE id = ?').bind(id.toLowerCase()).first();
      if (existing && existing.topic !== topic.trim()) return json({ error: 'This request ID belongs to a different topic. Start a new job.' }, 409);
      let sourceUrls;
      try { sourceUrls = selectSources(topic.trim(), body.sourceUrls); }
      catch (error) { return json({ error: error.message }, 400); }
      const result = await createVideo(env, id.toLowerCase(), topic.trim(), sourceUrls);
      if (result.error) return json({ error: result.error, ...(result.video ? { video: result.video } : {}) }, result.code);
      let pipeline;
      try { pipeline = await startProduction(env, result.video.id); }
      catch (error) { pipeline = { started: false, error: error.message, code: error.code || 503 }; }
      return json({ status: result.video.status, video: result.video, reused: result.reused,
        pipeline, message: pipeline.error || pipeline.message }, result.code);
    } catch (error) {
      if (error.code && error.message) return json({ error: error.message }, error.code);
      console.error('Storage request failed', error);
      return json({ error: 'Could not complete the storage request. Retry shortly.' }, 503);
    }
  },
};
