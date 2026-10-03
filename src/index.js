import { dashboardHtml } from './dashboard.js';
import { createVideo, DEFAULT_TOPIC, ensureSchema, listVideos, UUID } from './jobs.js';
import { selectSources } from './sources.js';
import { startProduction } from './workflow.js';
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
        return json({ status: 'ok', service: 'techfieldtest', version: '0.3.0', storage,
          pipeline: { ai: Boolean(env.AI), workflow: Boolean(env.PRODUCTION) }, timestamp: new Date().toISOString() });
      } catch (error) {
        console.error('Storage health check failed', error);
        return json({ status: 'degraded', service: 'techfieldtest', version: '0.3.0', storage,
          message: 'Storage is not ready. Check the Cloudflare build logs and DB / ASSETS bindings.' }, 503);
      }
    }

    const isList = url.pathname === '/api/videos' && request.method === 'GET';
    const isCreate = url.pathname === '/api/generate' && request.method === 'POST';
    const artifactMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/(brief|research|script)$/);
    const isArtifact = artifactMatch && request.method === 'GET';
    const startMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/start$/);
    const isStart = startMatch && request.method === 'POST';
    if (!isList && !isCreate && !isArtifact && !isStart) return json({ error: 'Not found' }, 404);
    if (isCreate || isStart) {
      const origin = request.headers.get('origin');
      if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        return json({ error: 'Cross-site job creation is not allowed.' }, 403);
      }
    }
    if (!env.DB || !env.ASSETS) return json({ error: 'Storage is not ready. Check the Cloudflare build logs and DB / ASSETS bindings.' }, 503);

    try {
      if (isList) return json(await listVideos(env));
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
