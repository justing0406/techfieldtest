# TechFieldTest

Control room for the TechFieldTest content pipeline: TikTok, Instagram Reels and YouTube Shorts.

## V0.3: research and script drafts

Enter a topic and click **Generate video job**. The Worker saves a D1 record and R2 brief, then starts a durable Cloudflare Workflow. It reads source pages, extracts source-backed facts, and generates a timed 30–45 second script using Workers AI. The dashboard polls progress and displays **Script ready for review** when the draft is saved. Click **Read script** for narration, captions, scene timing, visual directions and source links.

This milestone creates a research packet and script, not an MP4. Voice, rendering and publishing are not connected yet. Every draft requires human review. Hands-on testing claims are blocked because tests have not yet been performed.

### Research scope

Meeting-note topics use the official Otter, Fireflies, Fathom, Granola and tl;dv pricing pages as the initial source catalog. Other topics require 2–5 source URLs in the dashboard. Prefer product and documentation pages. This version fetches those pages; it does not perform an open-web search or operate the products.

At least two pages must be readable. Failed pages are listed in the research packet and draft; blocked or JavaScript-only pages may need a different URL. Source URLs and redirects are validated, page reads are bounded, and scripts, navigation and styles are removed from the source text. Each source has its retrieval time and a SHA-256 hash of the extracted excerpt.

Workers AI first extracts one fact per used source with a short evidence quote. The Worker verifies that each quote appears in the corresponding page, then makes a second model call for the script. Draft validation checks scene lengths, total duration, spoken word count, fact references and unsupported testing claims. Quote matching verifies evidence presence; it does not prove semantic correctness. Review prices, plan context and comparisons before publishing.

### Generation and limits

The native `AI` binding uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. No separate API key is required. The `PRODUCTION` Workflow binding survives closing the dashboard and retries each failed step once. Research and script generation can consume Workers AI and Workflows usage under your Cloudflare plan. Set `AI_MODEL` to change the model only to one supporting the same JSON-mode input.

An atomic D1 reservation limits the project to 10 research starts per UTC day by default (`MAX_RUNS_PER_DAY` in `wrangler.jsonc`). A capped job stays saved and can be started the next day. An idempotent Workflow submission prevents double runs when a request is retried. Previously saved queued jobs have a **Start research** button; their meeting-tool sources are selected automatically. Failed production runs retain their error and any completed research. Create a new job to retry a failed generation run.

### Storage

- `DB`: D1 database `techfieldtest-db`, containing `videos` and `production_runs`.
- `ASSETS`: R2 bucket `techfieldtest-assets`, containing `jobs/<uuid>/brief.json`, `research.json` and `script.json`. Future narration, screenshots and MP4s can use that same per-job prefix.

The Worker marks a job queued only after its R2 brief is saved. Storage failures retain a failed record in the queue; create a new job to retry. A crashed or interrupted request can leave a job marked Saving, so the UI does not report it as ready.

## Cloudflare deployment

Your existing GitHub -> Cloudflare Workers Builds integration can keep its `npx wrangler deploy` command. Wrangler is pinned and a lockfile is included.

The configuration deliberately omits resource IDs. Wrangler's [automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/) creates or links the D1 and R2 bindings during deployment and reuses the linked resources on subsequent deploys. It may update the build's local config with IDs; committing those IDs is not required to preserve the bindings.

The additive schemas in `migrations/0001_jobs.sql` and `0002_production.sql` are bundled with the Worker and applied with `CREATE ... IF NOT EXISTS` on first storage use. Existing jobs are preserved. This deployment works with the existing deploy command without a separate migration step. Future non-additive schema changes must use versioned migrations.

After the build succeeds, open `/api/health`. Expect HTTP 200 and:

```json
{"status":"ok","version":"0.3.0","storage":{"d1":true,"r2":true},"pipeline":{"ai":true,"workflow":true}}
```

Health checks storage and binding presence; it does not make a paid inference request. Open the dashboard, create a job, wait for **Script ready for review**, and click **Read script** to check live inference and sources.

If provisioning fails, inspect the Cloudflare build log. The build token needs D1 and R2 resource creation permissions, and R2 must be enabled for the account. You can also create the resources manually:

```bash
npx wrangler d1 create techfieldtest-db
npx wrangler r2 bucket create techfieldtest-assets
```

Put the returned D1 UUID into `d1_databases[0].database_id` in `wrangler.jsonc`; keep the resource names and `DB` / `ASSETS` binding names. Deploy again. A degraded health response means storage is unavailable; the dashboard remains accessible and displays the error.

## Local development

```bash
npm ci
npm run dev
```

Wrangler uses local D1 and R2 storage. The initial schema is created on first use. No Cloudflare credentials are needed for local development.

```bash
npm test
```

Tests bundle the Worker and use Miniflare's actual D1, R2 and Workflow implementations. Model replies and fetched page content are fixtures. They cover job creation, persistence, idempotency, input validation, missing bindings, R2 failure, source extraction, evidence matching, script validation, workflow success/failure, existing jobs and the daily cap. They do not call a live model or establish real-world product quality.

```bash
npm run build
npm run deploy
```

For later schema migrations, after the remote database has been provisioned:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## API

| Route | Behavior |
| --- | --- |
| `GET /` | Control room dashboard |
| `GET /api/health` | Checks D1 schema access and R2 access; returns 503 when unavailable |
| `GET /api/videos` | Latest 100 jobs and counts across all jobs; today's count uses America/New_York |
| `POST /api/generate` | Persists a job and brief and submits research; 201 new / 200 existing |
| `POST /api/videos/<uuid>/start` | Starts a previously queued job; 202 accepted / 429 cap |
| `GET /api/videos/<uuid>/brief` | Streams the job's JSON brief from R2 |
| `GET /api/videos/<uuid>/research` | Saved source excerpts, evidence facts, uncertainties and test plan |
| `GET /api/videos/<uuid>/script` | Timed draft with narration, captions, visuals, fact references and sources |

`POST /api/generate` accepts `{"topic":"What should we test?","sourceUrls":["https://vendor.com/product","https://vendor.com/docs"]}`. Topic length: 1–240 characters. Omit `sourceUrls` for meeting-tool topics. Supply a version 4 UUID in `Idempotency-Key` for safe retries; the dashboard does this automatically. Empty requests use the default meeting topic and a generated UUID. Malformed input returns 400 and cross-site browser requests return 403. A saved job still returns 201 if workflow submission hits a cap or fails; inspect `pipeline.started`, `pipeline.error` and `pipeline.code`. The dashboard shows the message and lets you retry starting queued work.

The same-origin check blocks cross-site browser submissions; it does not authenticate users. The control room and artifact API are currently accessible to anyone who knows their URLs, with a global generation cap. Cloudflare Access can restrict the whole Worker to the owner.

## Next milestone

Add editing and script approval, then voice, visuals, a vertical video renderer and final video approval.
