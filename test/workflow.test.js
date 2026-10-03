import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { RESEARCH_QUOTE, SCRIPT_FIXTURE } from './fixtures.js';

const require = createRequire(import.meta.url);
process.env.MINIFLARE_WORKERD_PATH = createRequire(require.resolve('wrangler/package.json'))('workerd').default;
const urls = ['https://one.vendor.com/features', 'https://two.vendor.com/features'];
function makeRuntime(mode = 'ok', limit = '2') {
  return new Miniflare({ log: new Log(LogLevel.NONE), workers: [
    { name: 'app', modules: true, scriptPath: resolve('dist/index.js'), modulesRules: [{ type: 'Text', include: ['**/*.sql'] }], compatibilityDate: '2026-10-03',
      d1Databases: { DB: 'workflow-db' }, r2Buckets: { ASSETS: 'workflow-assets' },
      workflows: { PRODUCTION: { name: 'production-test', className: 'ProductionWorkflow' } },
      serviceBindings: { AI: { name: 'fake-ai', entrypoint: 'FakeAI' } }, bindings: { MAX_RUNS_PER_DAY: limit },
      outboundService: async () => new Response('<title>Official product features</title><main>' + RESEARCH_QUOTE + ' Published feature information for comparison. '.repeat(15) + '</main>', { headers: { 'Content-Type': 'text/html' } }),
    },
    { name: 'fake-ai', modules: true, compatibilityDate: '2026-10-03', bindings: { MODE: mode }, script: `
      import { WorkerEntrypoint } from 'cloudflare:workers';
      export class FakeAI extends WorkerEntrypoint {
        async run(model, input) {
          if (this.env.MODE === 'bad-json') return { response: 'Invalid JSON' };
          if (input.prompt.startsWith('TASK: RESEARCH')) {
            const sources = JSON.parse(input.prompt.split('SOURCE_DATA: ')[1]);
            return { response: JSON.stringify({ facts: sources.map(s => ({ sourceId:s.id,claim:'The page describes transcripts and meeting summaries.',quote:${JSON.stringify(RESEARCH_QUOTE)} })), uncertainties:['Quality has not been measured.'],testPlan:['Compare the same meeting recording.'] }) };
          }
          return { response: JSON.stringify(${JSON.stringify(SCRIPT_FIXTURE)}) };
        }
      }
      export default { fetch() { return new Response('Test service'); } };`,
    },
  ] });
}
async function post(mf, path, data) {
  return mf.dispatchFetch('https://example.com' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
async function queue(mf) { return (await mf.dispatchFetch('https://example.com/api/videos')).json(); }
async function waitFor(mf, id, status) {
  for (let index = 0; index < 160; index++) {
    const video = (await queue(mf)).videos.find(v => v.id === id);
    if (video?.status === status) return video;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Workflow did not reach ' + status + ': ' + JSON.stringify(await queue(mf)));
}

test('real workflow researches, writes a cited script, respects the cap and starts pre-existing jobs', async () => {
  const mf = makeRuntime();
  try {
    const response = await post(mf, '/api/generate', { topic: 'Compare the published features', sourceUrls: urls });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.pipeline.started, true);
    const ready = await waitFor(mf, created.video.id, 'awaiting_approval');
    assert.equal(ready.productionStatus, 'script_ready');
    const script = await (await mf.dispatchFetch('https://example.com' + ready.scriptUrl)).json();
    assert.equal(script.durationSeconds, 40);
    assert.equal(script.facts.length, 2);
    assert.equal(script.sources[0].url, urls[0]);
    assert.equal(script.approvalRequired, true);
    assert.equal(script.handsOnTestingCompleted, false);
    assert.equal((await queue(mf)).summary.awaitingApproval, 1);
    assert.equal((await post(mf, '/api/videos/' + ready.id + '/start')).status, 202);

    const db = await mf.getD1Database('DB', 'app');
    const assets = await mf.getR2Bucket('ASSETS', 'app');
    const oldId = crypto.randomUUID();
    const now = new Date().toISOString();
    const key = 'jobs/' + oldId + '/brief.json';
    await db.prepare("INSERT INTO videos (id,topic,status,manifest_key,created_at,updated_at) VALUES (?,?,'queued',?,?,?)").bind(oldId, 'Compare meeting note takers', key, now, now).run();
    await assets.put(key, JSON.stringify({ version: 1, id: oldId, topic: 'Compare meeting note takers' }));
    assert.equal((await post(mf, '/api/videos/' + oldId + '/start')).status, 202);
    await waitFor(mf, oldId, 'awaiting_approval');

    const capped = await (await post(mf, '/api/generate', { topic: 'Compare more features', sourceUrls: urls })).json();
    assert.equal(capped.pipeline.code, 429);
    assert.equal((await queue(mf)).videos.find(v => v.id === capped.video.id).status, 'queued');
    assert.equal((await post(mf, '/api/videos/' + capped.video.id + '/start')).status, 429);
  } finally { await mf.dispose(); }
});

test('invalid model output retries then records a failed job without a script', async () => {
  const mf = makeRuntime('bad-json');
  try {
    const result = await (await post(mf, '/api/generate', { topic: 'Compare features', sourceUrls: urls })).json();
    const failed = await waitFor(mf, result.video.id, 'failed');
    assert.match(failed.error, /invalid JSON/);
    assert.equal(failed.scriptUrl, null);
    assert.equal((await mf.dispatchFetch('https://example.com/api/videos/' + failed.id + '/script')).status, 404);
  } finally { await mf.dispose(); }
});
