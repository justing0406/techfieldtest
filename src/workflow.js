import { WorkflowEntrypoint } from 'cloudflare:workers';
import { ensureSchema } from './jobs.js';
import { collectSources, selectSources } from './sources.js';
import { generateResearch, generateScript, MODEL } from './generation.js';
import { generateComedy } from './creative.js';

const STEP_CONFIG = { retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' }, timeout: '3 minutes' };
const putJson = (env, key, data) => env.ASSETS.put(key, JSON.stringify(data, null, 2), { httpMetadata: { contentType: 'application/json' } });

export async function startProduction(env, videoId) {
  if (!env.PRODUCTION || !env.AI) return { started: false, message: 'Job saved. Research needs the AI and PRODUCTION bindings.' };
  await ensureSchema(env.DB);
  const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(videoId).first();
  if (!video) throw { code: 404, message: 'Job not found.' };
  if (video.status !== 'queued') return { started: false, message: 'This job is already processing or finished.' };
  const briefObject = await env.ASSETS.get(video.manifest_key);
  if (!briefObject) throw { code: 409, message: 'Save the job brief before starting research.' };
  const brief = await briefObject.json();
  const sourceUrls = selectSources(video.topic, brief.sourceUrls || []);
  const now = new Date().toISOString();
  const today = now.slice(0, 10) + 'T00:00:00.000Z';
  const configuredLimit = Number(env.MAX_RUNS_PER_DAY || 10);
  const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 100) : 10;
  // A single atomic insert enforces the global daily cap under concurrent requests.
  await env.DB.prepare(`INSERT INTO production_runs (video_id, workflow_id, status, created_at, updated_at)
    SELECT ?, ?, 'starting', ?, ? WHERE (SELECT COUNT(*) FROM production_runs WHERE created_at >= ?) < ?
    ON CONFLICT(video_id) DO NOTHING`).bind(videoId, videoId, now, now, today, limit).run();
  const run = await env.DB.prepare('SELECT * FROM production_runs WHERE video_id = ?').bind(videoId).first();
  if (!run) throw { code: 429, message: 'Daily research limit reached. The job is saved; start it tomorrow.' };
  if (run.status !== 'starting') return { started: false, message: 'This job already has a production run.' };
  try {
    // createBatch is idempotent for an existing instance ID. A retry can safely
    // repair the gap between recording the outbox row and submitting the workflow.
    await env.PRODUCTION.createBatch([{ id: run.workflow_id, params: { videoId, sourceUrls } }]);
    await env.DB.prepare("UPDATE production_runs SET status = 'running', updated_at = ? WHERE video_id = ? AND status = 'starting'").bind(now, videoId).run();
    await env.DB.prepare("UPDATE videos SET error = NULL WHERE id = ? AND status = 'queued'").bind(videoId).run();
    return { started: true, message: 'Research started. The script will appear here when ready.' };
  } catch (error) {
    console.error('Workflow submission failed', videoId, error);
    await env.DB.prepare('UPDATE videos SET error = ? WHERE id = ? AND status = ?')
      .bind('Research could not start. Click Start research to retry.', videoId, 'queued').run();
    throw { code: 503, message: 'Job saved, but research could not start. Click Start research to retry.' };
  }
}

export class ProductionWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { videoId, sourceUrls } = event.payload;
    const env = this.env;
    try {
      const loaded = await step.do('load-job', STEP_CONFIG, async () => {
        await ensureSchema(env.DB);
        const row = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(videoId).first();
        if (!row || !['queued', 'researching'].includes(row.status)) throw new Error('The job is not ready for research.');
        await env.DB.prepare("UPDATE videos SET status = 'researching', error = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), videoId).run();
        const brief = await env.ASSETS.get(row.manifest_key);
        return { topic: row.topic, creativeBrief: brief ? (await brief.json()).creativeBrief : null };
      });
      const { topic, creativeBrief } = typeof loaded === 'string' ? { topic: loaded, creativeBrief: null } : loaded;

      const researchKey = await step.do('research-source-pages', STEP_CONFIG, async () => {
        const collected = await collectSources(selectSources(topic, sourceUrls));
        const research = await generateResearch(env.AI, topic, collected.sources, env.AI_MODEL || MODEL, Boolean(creativeBrief));
        const key = 'jobs/' + videoId + '/research.json';
        await putJson(env, key, { version: 1, videoId, topic, generatedAt: new Date().toISOString(), model: env.AI_MODEL || MODEL, ...collected, ...research });
        await env.DB.prepare('UPDATE production_runs SET research_key = ?, status = ?, updated_at = ? WHERE video_id = ?')
          .bind(key, 'research_complete', new Date().toISOString(), videoId).run();
        return key;
      });

      const scriptKey = await step.do('generate-script', { ...STEP_CONFIG, timeout: '10 minutes' }, async () => {
        await env.DB.prepare("UPDATE videos SET status = 'scripting', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), videoId).run();
        const object = await env.ASSETS.get(researchKey);
        if (!object) throw new Error('Saved research is unavailable.');
        const research = await object.json();
        const draft = creativeBrief ? await generateComedy(env.AI, topic, research, creativeBrief, env.AI_MODEL || MODEL)
          : await generateScript(env.AI, topic, research, env.AI_MODEL || MODEL);
        const key = 'jobs/' + videoId + '/script.json';
        await putJson(env, key, { version: 1, videoId, generatedAt: new Date().toISOString(), model: env.AI_MODEL || MODEL, ...draft,
          facts: research.facts, uncertainties: research.uncertainties, testPlan: research.testPlan, sourceFailures: research.failures,
          sources: research.sources.map(({ id, url, title, retrievedAt, sha256 }) => ({ id, url, title, retrievedAt, sha256 })) });
        await env.DB.prepare('UPDATE production_runs SET script_key = ?, status = ?, updated_at = ? WHERE video_id = ?')
          .bind(key, 'script_ready', new Date().toISOString(), videoId).run();
        return key;
      });

      await step.do('mark-ready-for-review', STEP_CONFIG, async () => {
        if (creativeBrief) {
          const now = new Date().toISOString();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO render_runs(video_id,status,created_at,updated_at) VALUES (?,'pending',?,?) ON CONFLICT(video_id) DO NOTHING").bind(videoId, now, now),
            env.DB.prepare("UPDATE videos SET status='rendering', error=NULL, updated_at=? WHERE id=? AND status IN ('scripting','rendering')").bind(now, videoId),
          ]);
          return;
        }
        await env.DB.prepare("UPDATE videos SET status = 'awaiting_approval', error = NULL, updated_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), videoId).run();
      });
      return { videoId, researchKey, scriptKey, status: creativeBrief ? 'render_pending' : 'script_ready' };
    } catch (error) {
      const message = String(error.message || error).slice(0, 400);
      await step.do('record-production-failure', STEP_CONFIG, async () => {
        await env.DB.batch([
          env.DB.prepare("UPDATE videos SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(message, new Date().toISOString(), videoId),
          env.DB.prepare("UPDATE production_runs SET status = 'failed', updated_at = ? WHERE video_id = ?").bind(new Date().toISOString(), videoId),
        ]);
      });
      throw error;
    }
  }
}
