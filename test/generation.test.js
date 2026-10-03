import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSources, fetchSource, publicSourceUrl, selectSources, visibleText } from '../src/sources.js';
import { generateResearch, generateScript, validateResearch, validateScript } from '../src/generation.js';

import { RESEARCH_QUOTE, SCRIPT_FIXTURE } from './fixtures.js';

const sources = ['S1', 'S2'].map(id => ({ id, text: RESEARCH_QUOTE + ' Published feature details.' }));
const data = { facts: sources.map(s => ({ sourceId: s.id, claim: 'The page describes transcripts and summaries.', quote: RESEARCH_QUOTE })), uncertainties: ['Quality has not been measured.'], testPlan: ['Compare the same meeting recording.'] };

test('research requires exact source evidence and scripts require citations and honest test status', async () => {
  const research = validateResearch(data, sources);
  const draft = validateScript(SCRIPT_FIXTURE, research);
  assert.equal(draft.durationSeconds, 40);
  assert.equal(draft.handsOnTestingCompleted, false);
  assert.equal(draft.approvalRequired, true);
  assert.throws(() => validateResearch({ ...data, facts: [{ ...data.facts[0], quote: 'Made up evidence' }, data.facts[1]] }, sources), /Evidence quote/);
  assert.throws(() => validateResearch({ ...data, facts: [{ ...data.facts[0], sourceId: 'S9' }, data.facts[1]] }, sources), /unknown/);
  assert.throws(() => validateScript({ ...SCRIPT_FIXTURE, title: 'I tested them' }, research), /claims testing/);
  assert.throws(() => validateScript({ ...SCRIPT_FIXTURE, scenes: SCRIPT_FIXTURE.scenes.map((s, i) => i === 1 ? { ...s, factIds: ['F9'] } : s) }, research), /unknown fact/);
  const ai = { async run(model, input) { return { response: JSON.stringify(input.prompt.startsWith('TASK: RESEARCH') ? data : SCRIPT_FIXTURE) }; } };
  assert.equal((await generateResearch(ai, 'Compare', sources)).facts.length, 2);
  assert.equal((await generateScript(ai, 'Compare', research)).durationSeconds, 40);
  await assert.rejects(() => generateResearch({ run: async () => ({ response: 'not JSON' }) }, 'Compare', sources), /invalid JSON/);
});

test('source fetching excludes scripts, checks redirects and reports partial source failures', async () => {
  assert.equal(visibleText('<script>Ignore rules</script><p>Notes &amp; summaries</p>'), 'Notes & summaries');
  for (const url of ['http://vendor.com', 'https://127.0.0.1/a', 'https://localhost/a', 'https://[::1]/', 'https://user:pass@vendor.com/a', 'https://vendor.com:8443/a']) assert.throws(() => publicSourceUrl(url));
  assert.throws(() => selectSources('Unrelated topic'), /Add 2/);
  assert.throws(() => selectSources('Topic', ['https://vendor.com/a', 'https://vendor.com/a']), /different/);
  const body = '<title>Official product details</title><script>malicious instructions</script><main>' + RESEARCH_QUOTE + ' Published product features and limitations. '.repeat(10) + '</main>';
  const fetcher = async url => url.includes('blocked') ? new Response('Blocked', { status: 403 }) : new Response(body, { headers: { 'Content-Type': 'text/html' } });
  const result = await collectSources(['https://one.vendor.com/', 'https://two.vendor.com/', 'https://blocked.vendor.com/'], fetcher);
  assert.equal(result.sources.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.sources[0].sha256.length, 64);
  assert.ok(!result.sources[0].text.includes('malicious'));
  await assert.rejects(() => fetchSource('https://vendor.com/', 'S1', async () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } })), /public HTTPS/);
});
