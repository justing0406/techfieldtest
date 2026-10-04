import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { validatePlan, generateComedy } from '../src/creative.js';
import { localDay } from '../src/calendar.js';
import { RESEARCH_QUOTE, RESEARCH_FACTS } from './fixtures.js';

const require = createRequire(import.meta.url);
process.env.MINIFLARE_WORKERD_PATH = createRequire(require.resolve('wrangler/package.json'))('workerd').default;
export const PLAN = { title: 'Your phone has forty bosses', beats: [
  { text: 'Your phone has forty bosses. Every app thinks its tiny update deserves a meeting.', caption: 'FORTY BOSSES. ONE PHONE.', layout: 'chat', actor: 'phone', voice: 'am_puck', sfx: 'pop', label: 'URGENT: ANOTHER NOTHING', items: [], factIds: [] },
  { text: 'Even the weather app wants a performance review. It thinks sunshine needs your immediate feedback.', caption: 'PLEASE HOLD', layout: 'character', actor: 'cloud', voice: 'am_onyx', sfx: 'boing', label: 'CLOUD: JUST CHECKING IN', items: [], factIds: [] },
  { text: 'Starter limits free recordings to thirty minutes.', caption: 'FIXTURE FACT ONE', layout: 'reveal', actor: 'phone', voice: 'am_puck', sfx: 'pop', label: '30 MINUTES', items: [], factIds: ['F1'] },
  { text: 'Plus captures computer audio without a meeting bot.', caption: 'FIXTURE FACT TWO', layout: 'comparison', actor: 'phone', voice: 'am_fenrir', sfx: 'tick', label: '', items: ['Computer audio', 'No meeting bot'], factIds: ['F2'] },
  { text: 'Send this to the friend whose phone interrupts its own interruptions.', caption: 'YOU KNOW THAT FRIEND', layout: 'character', actor: 'duck', voice: 'af_heart', sfx: 'pop', label: 'INTERRUPTION PENDING', items: [], factIds: [] },
  { text: 'Congratulations. Your notifications have formed a union. Their first demand is more meetings.', caption: 'NOTIFICATIONS UNIONIZED', layout: 'punchline', actor: 'phone', voice: 'am_onyx', sfx: 'silence', label: 'WE DEMAND YOUR ATTENTION', items: [], factIds: [] },
] };
const research = { facts: RESEARCH_FACTS.map((f, i) => ({ ...f, id: 'F' + (i + 1) })) };
const concepts = [0,1,2].map(i => ({ title: 'Concept ' + i, watchReason: 'Recognizable phone interruptions', shareReason: 'Send to the friend whose phone never stops', situation: 'Every app demands attention', punchline: 'Notifications unionized' }));

test('scene plans gate timing, evidence references, visual variety and executable directions', async () => {
  const good = validatePlan(PLAN, research);
  assert.equal(good.beats.length, 6);
  for (const alter of [p => p.beats[0].actor = '../execute.py', p => p.beats[2].factIds = ['F999'],
    p => p.beats[0].text = 'I tested the phone.', p => p.beats.forEach(b => b.layout = 'character')]) {
    const copy = structuredClone(PLAN); alter(copy); assert.throws(() => validatePlan(copy, research));
  }
  const calls = [];
  const ai = { async run(model, input) {
    const task = input.prompt.split('\n')[0]; calls.push(task);
    return { response: JSON.stringify(task === 'TASK: CONCEPTS' ? { concepts } : task === 'TASK: CONCEPT_EDITOR' ? { chosenIndex: 1, reason: 'Specific friend and visual payoff' } : task === 'TASK: COMEDY_EDITOR' ? { score: 9, supported: true, engaging: true, issues: [] } : PLAN) };
  } };
  const script = await generateComedy(ai, 'Test topic', research, { friend: 'Distracted friend' });
  assert.equal(script.selectedConcept.title, 'Concept 1');
  assert.deepEqual(calls, ['TASK: CONCEPTS','TASK: CONCEPT_EDITOR','TASK: COMEDY_SCRIPT','TASK: COMEDY_EDITOR']);
});

test('daily boundaries follow New York across daylight-saving transitions', () => {
  assert.equal(localDay(new Date('2026-10-04T03:59:00Z')), '2026-10-03');
  assert.equal(localDay(new Date('2026-10-04T04:00:00Z')), '2026-10-04');
  assert.equal(localDay(new Date('2026-12-04T04:59:00Z')), '2026-12-03');
  assert.equal(localDay(new Date('2026-12-04T05:00:00Z')), '2026-12-04');
});

const b64 = bytes => Buffer.from(bytes).toString('base64url');
async function setup() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256' };
  async function token(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://token.actions.githubusercontent.com', aud: 'techfieldtest-render', iat: now, nbf: now - 1, exp: now + 300,
      repository: 'justing0406/techfieldtest', repository_id: '1403649581', repository_owner_id: '253958327', ref: 'refs/heads/main',
      workflow_ref: 'justing0406/techfieldtest/.github/workflows/daily-production.yml@refs/heads/main', event_name: 'schedule', ...overrides };
    const unsigned = b64(JSON.stringify({ alg: 'RS256', kid: 'test-key' })) + '.' + b64(JSON.stringify(claims));
    return unsigned + '.' + b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned)));
  }
  const mf = new Miniflare({ log: new Log(LogLevel.NONE), workers: [
    { name: 'app', modules: true, scriptPath: resolve('dist/index.js'), modulesRules: [{ type: 'Text', include: ['**/*.sql'] }], compatibilityDate: '2026-10-03',
      d1Databases: { DB: 'daily-db' }, r2Buckets: { ASSETS: 'daily-assets' },
      workflows: { PRODUCTION: { name: 'daily-production', className: 'ProductionWorkflow' } }, serviceBindings: { AI: { name: 'fake-ai', entrypoint: 'FakeAI' } },
      bindings: { DAILY_ENABLED: 'true', RENDER_REPOSITORY: 'justing0406/techfieldtest', RENDER_REPOSITORY_ID: '1403649581', RENDER_OWNER_ID: '253958327', OWNER_TOKEN: 'test-owner' },
      outboundService: async request => new URL(request.url).hostname === 'token.actions.githubusercontent.com'
        ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } })
        : new Response('<title>Fixture official page</title><main>' + RESEARCH_QUOTE + ' Published useful details. '.repeat(20) + '</main>', { headers: { 'content-type': 'text/html' } }),
    },
    { name: 'fake-ai', modules: true, compatibilityDate: '2026-10-03', script: `import { WorkerEntrypoint } from 'cloudflare:workers';
      export class FakeAI extends WorkerEntrypoint { async run(model,input) {
        const task=input.prompt.split('\\n')[0];
        const data=task==='TASK: RESEARCH' ? {facts:${JSON.stringify(RESEARCH_FACTS)},uncertainties:[],testPlan:[]}
          : task==='TASK: CONCEPTS' ? {concepts:${JSON.stringify(concepts)}}
          : task==='TASK: CONCEPT_EDITOR' ? {chosenIndex:0,reason:'Specific friend'}
          : task==='TASK: COMEDY_EDITOR' ? {score:9,supported:true,engaging:true,issues:[]}
          : ${JSON.stringify(PLAN)};
        return {response:JSON.stringify(data)};
      } } export default {fetch(){return new Response('Fixture');}};` },
  ] });
  return { mf, token };
}
async function post(mf, path, body = {}, auth) {
  return mf.dispatchFetch('https://example.com' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(body) });
}
async function ready(mf) {
  for (let i = 0; i < 160; i++) {
    const { videos } = await (await mf.dispatchFetch('https://example.com/api/videos')).json();
    if (videos.length === 2 && videos.every(v => v.renderStatus === 'pending')) return videos;
    if (videos.some(v => v.status === 'failed')) throw new Error(JSON.stringify(videos));
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Daily workflow did not finish');
}

test('two daily jobs deduplicate, render leases recover, and actual assets gate review', async () => {
  const { mf, token } = await setup();
  try {
    await Promise.all([post(mf, '/api/daily/run'), post(mf, '/api/daily/run')]);
    const videos = await ready(mf);
    assert.equal(videos.length, 2); assert.ok(videos.every(v => !v.videoUrl));
    assert.equal((await (await mf.dispatchFetch('https://example.com/api/daily')).json()).slots.length, 2);
    assert.equal((await post(mf, '/api/renderer/claim')).status, 401);
    for (const claims of [{ repository_id: 'another-repo' }, { event_name: 'pull_request' }, { aud: 'wrong' }, { exp: 1 }, { workflow_ref: 'other-workflow' }]) {
      assert.equal((await post(mf, '/api/renderer/claim', {}, await token(claims))).status, 403);
    }
    const auth = await token();
    const first = (await (await post(mf, '/api/renderer/claim', {}, auth)).json()).job;
    const second = (await (await post(mf, '/api/renderer/claim', {}, auth)).json()).job;
    assert.notEqual(first.videoId, second.videoId);
    assert.equal((await (await post(mf, '/api/renderer/claim', {}, auth)).json()).job, null);
    assert.equal((await post(mf, '/api/renderer/' + first.videoId + '/complete', { leaseId: first.leaseId, qa: { passed: true } }, auth)).status, 400);
    assert.equal((await post(mf, '/api/videos/' + first.videoId + '/review', { decision: 'approved', note: '' }, 'test-owner')).status, 409);
    const db = await mf.getD1Database('DB', 'app');
    await db.prepare("UPDATE render_runs SET lease_until='2000-01-01' WHERE video_id=?").bind(first.videoId).run();
    const replacement = (await (await post(mf, '/api/renderer/claim', {}, auth)).json()).job;
    assert.equal(replacement.videoId, first.videoId); assert.notEqual(replacement.leaseId, first.leaseId);
    assert.equal((await post(mf, '/api/renderer/' + first.videoId + '/fail', { leaseId: first.leaseId, error: 'stale' }, auth)).status, 409);
    const video = Buffer.alloc(11000); video.write('ftyp', 4);
    const poster = Buffer.alloc(200); poster[0] = 255; poster[1] = 216;
    for (const [kind, bytes] of [['video',video],['poster',poster]]) {
      const response = await mf.dispatchFetch('https://example.com/api/renderer/' + first.videoId + '/' + kind, { method: 'PUT', headers: {
        authorization: 'Bearer ' + auth, 'x-render-lease': replacement.leaseId, 'content-length': String(bytes.length) }, body: bytes });
      assert.equal(response.status, 200, await response.text());
    }
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', video)).toString('hex');
    const qa = { version: 1, passed: true, width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac',
      durationSeconds: 30, integratedLufs: -16, truePeakDb: -1.5, decoded: true, captionBoundsChecked: true, sha256: hash };
    assert.equal((await post(mf, '/api/renderer/' + first.videoId + '/complete', { leaseId: replacement.leaseId, qa: { ...qa, sha256: '0'.repeat(64) } }, auth)).status, 400);
    for (let i = 0; i < 2; i++) assert.equal((await post(mf, '/api/renderer/' + first.videoId + '/complete', { leaseId: replacement.leaseId, qa }, auth)).status, 200);
    const media = 'https://example.com/api/videos/' + first.videoId + '/video';
    const range = await mf.dispatchFetch(media, { headers: { range: 'bytes=4-7' } });
    assert.equal(range.status, 206); assert.equal(await range.text(), 'ftyp');
    assert.equal((await mf.dispatchFetch(media, { headers: { range: 'bytes=999999-' } })).status, 416);
    assert.equal((await post(mf, '/api/videos/' + first.videoId + '/review', { decision: 'approved', note: 'Good' })).status, 401);
    const approved = await (await post(mf, '/api/videos/' + first.videoId + '/review', { decision: 'approved', note: 'Good' }, 'test-owner')).json();
    assert.equal(approved.published, false);
    const row = await db.prepare('SELECT status FROM videos WHERE id=?').bind(first.videoId).first(); assert.equal(row.status, 'approved');
    await post(mf, '/api/renderer/' + second.videoId + '/fail', { leaseId: second.leaseId, error: 'Expected test failure' }, auth);
    assert.equal((await (await post(mf, '/api/renderer/claim', {}, auth)).json()).job.videoId, second.videoId);
  } finally { await mf.dispose(); }
});
