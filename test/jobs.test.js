import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { createRequire } from 'node:module';

// Keep the stable Miniflare test API, using the same runtime binary as Wrangler
// so the deployed compatibility date is tested without downgrading it.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
process.env.MINIFLARE_WORKERD_PATH = wranglerRequire('workerd').default;

const topic = 'Compare meeting note takers';
const id = '12345678-1234-4123-8123-123456789abc';
const failingId = '12345678-1234-4123-8123-123456789abd';
function options(path, failR2 = false) {
  const worker = {
    name: 'techfieldtest', modules: true, scriptPath: resolve('dist/index.js'),
    modulesRules: [{ type: 'Text', include: ['**/*.sql'] }],
    compatibilityDate: '2026-10-03', d1Databases: { DB: 'test-db' },
    ...(failR2 ? { serviceBindings: { ASSETS: { name: 'failing-assets', entrypoint: 'FailingAssets' } } } : { r2Buckets: { ASSETS: 'test-assets' } }),
  };
  return {
    log: new Log(LogLevel.NONE), d1Persist: join(path, 'd1'), r2Persist: join(path, 'r2'),
    workers: [worker, ...(failR2 ? [{ name: 'failing-assets', modules: true, compatibilityDate: '2026-10-03',
      script: `import { WorkerEntrypoint } from 'cloudflare:workers';
      export class FailingAssets extends WorkerEntrypoint { async put() { throw new Error('Simulated storage outage'); } }
      export default { fetch() { return new Response('Unavailable', { status: 503 }); } };` }] : [])],
  };
}
const post = (mf, body = { topic }, key = id, extra = {}) => mf.dispatchFetch('https://example.com/api/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra }, body: JSON.stringify(body),
});
const read = async (mf, path) => (await mf.dispatchFetch('https://example.com' + path)).json();

test('D1 jobs and R2 briefs persist, retries deduplicate, and invalid requests leave storage unchanged', async () => {
  const path = await mkdtemp(join(tmpdir(), 'techfieldtest-'));
  let mf = new Miniflare(options(path));
  try {
    assert.equal((await read(mf, '/api/health')).status, 'ok');
    assert.deepEqual((await read(mf, '/api/videos')).videos, []);
    const dashboard = await (await mf.dispatchFetch('https://example.com/')).text();
    assert.match(dashboard, /Generate video job/);
    assert.match(dashboard, /Waiting for research/);
    const response = await post(mf);
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.video.status, 'queued');
    assert.equal(created.video.id, id);
    const brief = await read(mf, created.video.briefUrl);
    assert.equal(brief.topic, topic);
    assert.equal(brief.approvalRequired, true);
    assert.deepEqual(brief.evidence, []);
    const queue = await read(mf, '/api/videos');
    assert.equal(queue.videos.length, 1);
    assert.equal(queue.summary.queued, 1);
    assert.equal(queue.summary.videosToday, 1);
    assert.equal(queue.summary.awaitingApproval, 0);
    const retry = await post(mf);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).reused, true);
    assert.equal((await post(mf, { topic: 'Different topic' })).status, 409);
    for (const body of [null, [], { topic: '' }, { topic: 7 }, { topic: 'x'.repeat(241) }]) {
      assert.equal((await post(mf, body)).status, 400);
    }
    assert.equal((await post(mf, { topic }, 'invalid')).status, 400);
    assert.equal((await post(mf, { topic }, id, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await post(mf, { topic }, id, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await mf.dispatchFetch('https://example.com/api/generate', { method: 'POST', body: 'text' })).status, 415);
    assert.equal((await mf.dispatchFetch('https://example.com/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
    assert.equal((await post(mf, { topic: 'x'.repeat(5000) })).status, 413);
    assert.equal((await mf.dispatchFetch('https://example.com/api/videos/12345678-1234-4123-8123-123456789fff/brief')).status, 404);
    assert.equal((await read(mf, '/api/videos')).summary.total, 1);

    await mf.dispose();
    mf = new Miniflare(options(path));
    assert.equal((await read(mf, '/api/videos')).videos[0].id, id);
    assert.equal((await read(mf, created.video.briefUrl)).id, id);
    assert.equal((await post(mf)).status, 200);

    await mf.dispose();
    mf = new Miniflare(options(path, true));
    const failed = await post(mf, { topic }, failingId);
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).video.status, 'failed');
    const afterFailure = await read(mf, '/api/videos');
    assert.equal(afterFailure.summary.total, 2);
    assert.equal(afterFailure.summary.queued, 1);
    assert.equal(afterFailure.videos.find(v => v.id === failingId).status, 'failed');
    assert.equal((await post(mf, { topic }, failingId)).status, 409);
  } finally { await mf.dispose(); await rm(path, { recursive: true, force: true }); }
});

test('missing storage bindings report degraded health and keep the dashboard available', async () => {
  const mf = new Miniflare({ log: new Log(LogLevel.NONE), modules: true, scriptPath: resolve('dist/index.js'),
    modulesRules: [{ type: 'Text', include: ['**/*.sql'] }], compatibilityDate: '2026-10-03' });
  try {
    assert.equal((await mf.dispatchFetch('https://example.com/')).status, 200);
    assert.equal((await mf.dispatchFetch('https://example.com/api/health')).status, 503);
    assert.equal((await read(mf, '/api/health')).status, 'degraded');
    assert.equal((await mf.dispatchFetch('https://example.com/api/videos')).status, 503);
    assert.equal((await post(mf)).status, 503);
  } finally { await mf.dispose(); }
});
