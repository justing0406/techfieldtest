import { ensureSchema, createVideo } from './jobs.js';
import { startProduction } from './workflow.js';
import { localDay } from './calendar.js';
export { localDay } from './calendar.js';

export const SEEDS = [
  { id: 'rain', topic: 'The friend who cancels plans after seeing a rain icon: read the forecast timing',
    friend: 'The friend who cancels every outdoor plan', actor: 'cloud',
    sourceUrls: ['https://www.weather.gov/lmk/pops', 'https://www.weather.gov/forecastpoints'] },
  { id: 'fridge', topic: 'The friend who keeps opening the fridge: give a recipe assistant the ingredients you actually have',
    friend: 'The struggling cook waiting for dinner to spawn', actor: 'egg',
    sourceUrls: ['https://www.epa.gov/recycle/preventing-wasted-food-home', 'https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-egg-safety'] },
  { id: 'notifications', topic: 'The friend whose phone interrupts everything: schedule quiet time and choose allowed contacts',
    friend: 'The friend whose phone never stops interrupting', actor: 'phone',
    sourceUrls: ['https://support.apple.com/en-us/105112', 'https://support.apple.com/en-us/108302'] },
  { id: 'battery', topic: 'The friend who lives at one percent battery: check what is using power before blaming the phone',
    friend: 'The friend always asking for a charger', actor: 'battery',
    sourceUrls: ['https://support.apple.com/en-us/102432', 'https://www.apple.com/batteries/maximizing-performance/'] },
  { id: 'leftovers', topic: 'The friend treating leftovers like an archaeological dig: label dates and store food promptly',
    friend: 'The friend with mysterious containers in the fridge', actor: 'cheddar',
    sourceUrls: ['https://www.epa.gov/recycle/preventing-wasted-food-home', 'https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely'] },
  { id: 'storage', topic: 'The friend deleting everything because their phone is full: inspect the storage breakdown first',
    friend: 'The friend who has to delete something before taking a photo', actor: 'phone',
    sourceUrls: ['https://support.apple.com/en-us/108429', 'https://support.apple.com/en-us/102670'] },
  { id: 'passwords', topic: 'The friend using the same password everywhere: a password manager remembers unique passwords',
    friend: 'The friend whose password is also every other password', actor: 'duck',
    sourceUrls: ['https://support.apple.com/en-us/120758', 'https://support.apple.com/en-us/102660'] },
  { id: 'mealplan', topic: 'The friend buying groceries without a dinner plan: check the cupboard before making the list',
    friend: 'The friend with groceries but somehow no meals', actor: 'tortilla',
    sourceUrls: ['https://www.epa.gov/recycle/preventing-wasted-food-home', 'https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely'] },
];

export async function dailyStatus(env) {
  await ensureSchema(env.DB);
  const day = localDay();
  const slots = (await env.DB.prepare(`SELECT d.*, v.status, v.error FROM daily_slots d LEFT JOIN videos v ON v.id=d.video_id WHERE d.day=? ORDER BY d.slot`).bind(day).all()).results;
  const backlog = await env.DB.prepare(`SELECT COUNT(*) AS count FROM render_runs WHERE status IN ('pending','leased') OR (status='complete' AND review IS NULL)`).first();
  const renderer = await env.DB.prepare("SELECT updated_at FROM pipeline_state WHERE key='renderer'").first();
  return { enabled: env.DAILY_ENABLED === 'true', target: 2, timezone: 'America/New_York', day, slots,
    backlog: backlog.count, backlogLimit: 6, rendering: 'GitHub Actions',
    rendererLastSeenAt: renderer?.updated_at || null,
    approvalEnabled: Boolean(env.OWNER_TOKEN), publishingConnected: false, analyticsConnected: false,
    researchMode: 'Source-backed topic families and saved audience hypotheses. Fresh competitor discovery is not connected.' };
}

async function slotUuid(day, slot) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('techfieldtest-daily-v1:' + day + ':' + slot))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const s = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
  return [s.slice(0, 8), s.slice(8, 12), s.slice(12, 16), s.slice(16, 20), s.slice(20)].join('-');
}

export async function runDaily(env, date = new Date(), force = false) {
  await ensureSchema(env.DB);
  if (!force && env.DAILY_ENABLED !== 'true') return { started: 0, message: 'Daily production is paused.' };
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(date));
  if (!force && hour < 6) return { started: 0, message: 'Daily production starts after 6 AM New York time.' };
  const day = localDay(date), results = [];
  for (const slot of [1, 2]) {
    const id = await slotUuid(day, slot);
    let reserved = await env.DB.prepare('SELECT * FROM daily_slots WHERE day=? AND slot=?').bind(day, slot).first();
    if (!reserved) {
      const history = (await env.DB.prepare('SELECT seed_id, MAX(day) AS last_day FROM daily_slots GROUP BY seed_id').all()).results;
      const last = new Map(history.map(r => [r.seed_id, r.last_day]));
      const todays = (await env.DB.prepare('SELECT seed_id FROM daily_slots WHERE day=?').bind(day).all()).results.map(r => r.seed_id);
      const seed = [...SEEDS].filter(s => !todays.includes(s.id)).sort((a, b) => (last.get(a.id) || '').localeCompare(last.get(b.id) || '') || SEEDS.indexOf(a) - SEEDS.indexOf(b))[0];
      // Capacity includes reserved/in-progress jobs; atomic insertion prevents overlapping
      // cron and runner calls from exceeding the six-video review buffer.
      const inserted = await env.DB.prepare(`INSERT INTO daily_slots(day,slot,video_id,seed_id,created_at)
        SELECT ?,?,?,?,? WHERE (
          SELECT COUNT(*) FROM daily_slots d LEFT JOIN videos v ON v.id=d.video_id LEFT JOIN render_runs r ON r.video_id=d.video_id
          WHERE v.id IS NULL OR v.status IN ('creating','queued','researching','scripting','rendering') OR (r.status='complete' AND r.review IS NULL)
        ) < 6 ON CONFLICT(day,slot) DO NOTHING`).bind(day, slot, id, seed.id, date.toISOString()).run();
      reserved = await env.DB.prepare('SELECT * FROM daily_slots WHERE day=? AND slot=?').bind(day, slot).first();
      if (!reserved) { results.push({ slot, skipped: true, reason: 'Review buffer is full.' }); continue; }
    }
    const seed = SEEDS.find(s => s.id === reserved.seed_id);
    const recentRows = (await env.DB.prepare('SELECT v.topic, p.script_key FROM videos v LEFT JOIN production_runs p ON p.video_id=v.id ORDER BY v.created_at DESC LIMIT 14').all()).results;
    const recent = await Promise.all(recentRows.map(async row => {
      const object = row.script_key && await env.ASSETS.get(row.script_key);
      const draft = object ? await object.json() : null;
      return { topic: row.topic, title: draft?.title || null, concept: draft?.selectedConcept || null };
    }));
    const existing = await env.DB.prepare('SELECT * FROM videos WHERE id=?').bind(reserved.video_id).first();
    if (existing && !['creating','queued'].includes(existing.status)) {
      results.push({ slot, videoId: reserved.video_id, started: false, message: 'Daily draft already processing or finished.' });
      continue;
    }
    // Repair a crash after the slot reservation or before brief persistence. Workflow
    // start failures remain queued and are retried without reserving a third job.
    if (existing?.status === 'creating') {
      const object = await env.ASSETS.get(existing.manifest_key);
      if (object) await env.DB.prepare("UPDATE videos SET status='queued' WHERE id=? AND status='creating'").bind(existing.id).run();
      else {
        const brief = { version: 4, id: existing.id, topic: seed.topic, sourceUrls: seed.sourceUrls,
          creativeBrief: { ...seed, dailyDay: day, recentTopics: recent }, approvalRequired: true };
        await env.ASSETS.put(existing.manifest_key, JSON.stringify(brief), { httpMetadata: { contentType: 'application/json' } });
        await env.DB.prepare("UPDATE videos SET status='queued', updated_at=? WHERE id=? AND status='creating'").bind(date.toISOString(), existing.id).run();
      }
    }
    const result = await createVideo(env, reserved.video_id, seed.topic, seed.sourceUrls, null,
      { ...seed, dailyDay: day, recentTopics: recent, audience: 'Relatable everyday comedy; send to an identifiable friend',
        selectionPolicy: 'Fresh original situation and punchline. Do not repeat recent scripts. Small-creator breakout research remains pending.' });
    if (result.error) { results.push({ slot, videoId: reserved.video_id, error: result.error }); continue; }
    try { results.push({ slot, videoId: reserved.video_id, ...await startProduction(env, reserved.video_id) }); }
    catch (error) { results.push({ slot, videoId: reserved.video_id, error: error.message }); }
  }
  return { day, results, target: 2 };
}
