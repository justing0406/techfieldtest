import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSources, fetchSource, publicSourceUrl, selectSources, visibleText } from '../src/sources.js';
import { generateResearch, generateScript, validateResearch, validateScript, editorialIssues } from '../src/generation.js';

import { RESEARCH_QUOTE, SCRIPT_FIXTURE, RESEARCH_FACTS, EDITOR_FIXTURE } from './fixtures.js';

const sources = ['S1', 'S2'].map(id => ({ id, text: RESEARCH_QUOTE + ' Published feature details.' }));
const data = { facts: RESEARCH_FACTS, uncertainties: ['Quality has not been measured.'], testPlan: ['Compare the same meeting recording.'] };

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
  const ai = { async run(model, input) { return { response: JSON.stringify(input.prompt.startsWith('TASK: RESEARCH') ? data : input.prompt.startsWith('TASK: EDITOR') ? EDITOR_FIXTURE : SCRIPT_FIXTURE) }; } };
  assert.equal((await generateResearch(ai, 'Compare', sources)).facts.length, 2);
  assert.equal((await generateScript(ai, 'Compare', research)).durationSeconds, 40);
  await assert.rejects(() => generateResearch({ run: async () => ({ response: 'not JSON' }) }, 'Compare', sources), /invalid JSON/);
});

test('the first live draft pattern is rejected and rewritten with actionable editor feedback', async () => {
  const research = validateResearch(data, sources);
  const bad = { ...SCRIPT_FIXTURE, scenes: SCRIPT_FIXTURE.scenes.map((scene, i) => i === 0 ? { ...scene, narration: 'AI meeting note takers can help you stay organized and focused during meetings.', factIds: [] } : i === 3 ? { ...scene, narration: "While these AI meeting note takers offer various features, it's essential to test and compare them to find the best fit for your needs.", factIds: [] } : scene) };
  assert.ok(editorialIssues(validateScript(bad, research)).length >= 4);
  let drafts = 0;
  const prompts = [];
  const ai = { async run(model, input) {
    prompts.push(input.prompt);
    return { response: JSON.stringify(input.prompt.startsWith('TASK: EDITOR') ? EDITOR_FIXTURE : ++drafts === 1 ? bad : SCRIPT_FIXTURE) };
  } };
  const result = await generateScript(ai, 'Meeting tools', research);
  assert.equal(result.editorialReview.attempts, 2);
  assert.match(prompts.findLast(p => p.startsWith('TASK: SCRIPT')), /Replace the generic introduction/);
  await assert.rejects(() => generateScript({ run: async (model, input) => ({ response: JSON.stringify(input.prompt.startsWith('TASK: EDITOR') ? EDITOR_FIXTURE : bad) }) }, 'Meeting tools', research), /did not pass editorial/);
});

test('multiple useful facts per source are accepted within a shared quote budget', () => {
  const research = validateResearch({ ...data, facts: [...data.facts, { ...data.facts[0], claim: 'Starter offers a free plan.', dimension: 'pricing' }] }, sources);
  assert.equal(research.facts.length, 3);
});

test('daily chat models receive the full research task as a user message', async () => {
  let captured;
  const ai = { run: async (model, input) => {
    captured = input;
    return { response: data };
  } };
  await generateResearch(ai, 'Everyday dinner', sources, '@cf/meta/llama-3.3-70b-instruct-fp8-fast', true);
  assert.equal(captured.prompt, undefined);
  assert.equal(captured.messages[1].role, 'user');
  assert.match(captured.messages[1].content, /Everyday dinner/);
  assert.match(captured.messages[1].content, /SOURCE_DATA:/);
  assert.match(captured.messages[0].content, /"minItems":2/);
  assert.equal(captured.response_format, undefined);
});

test('model output supports native, chat and Responses formats and editor failures are enforced', async () => {
  const research = validateResearch(data, sources);
  for (const wrap of [value => ({ choices: [{ message: { content: JSON.stringify(value) } }] }), value => ({ output: [{ type: 'reasoning', content: [{ type: 'output_text', text: 'ignore reasoning' }] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })]) {
    const ai = { run: async (model, input) => wrap(input.prompt.startsWith('TASK: EDITOR') ? EDITOR_FIXTURE : SCRIPT_FIXTURE) };
    assert.equal((await generateScript(ai, 'Meeting tools', research)).editorialReview.score, 9);
  }
  const ai = { run: async (model, input) => ({ response: input.prompt.startsWith('TASK: EDITOR') ? { ...EDITOR_FIXTURE, score: 3, supported: false, issues: ['The recommendation is not supported.'] } : SCRIPT_FIXTURE }) };
  await assert.rejects(() => generateScript(ai, 'Meeting tools', research), /not supported/);
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
