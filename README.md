# TechFieldTest

Control room for the TechFieldTest content pipeline: TikTok, Instagram Reels and YouTube Shorts.

A [complete local production prototype](production/README.md) now produces an original 1080x1920 MP4 with narration, animated test visuals, captions and sound. Its first experiment demonstrates why a black rectangle can leave PDF text extractable. It includes a research brief and a verified synthetic test. This renderer is not yet connected to the deployed dashboard or platform publishing.

## V0.5: daily finished-video drafts

Two daily slots use America/New_York dates and start after 6 AM local time, including daylight-saving changes. **Make today's two drafts** starts the same slots immediately. A slot reuses its job ID, so retries and overlapping cron/runner calls do not create extra originals. Explicit regeneration replaces the slot with a linked revision and preserves the original job. Failed jobs stay visible instead of being silently replaced. A six-video buffer pauses new daily reservations until finished videos are reviewed.

The daily pipeline rotates source-backed everyday topic families, beginning with rain/plans and empty-fridge cooking. These use the user's preferences and saved audience hypotheses. **Fresh small-creator breakout discovery, platform publishing and performance analytics are not connected.** This milestone automates production, not the complete content business.

Daily research and scene direction use `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. A separate `@cf/openai/gpt-oss-120b` writer produces the complete spoken dialogue as text; direction preserves those lines verbatim. Strict validation requires 65–105 spoken words and checks the finished scene JSON before editorial review. `DAILY_AI_MODEL` selects the research/director model independently of the dialogue writer and legacy custom-script model. The research prompt extracts everyday facts rather than forcing product comparisons. Research inputs, raw replies and creative drafts are saved for diagnosis when a gate fails.

For each daily topic the Workflow fetches factual sources, verifies exact evidence quotes, creates three competing concepts, selects one for its watch/share reason, writes a structured scene plan, and checks entertainment and factual support with an editor. One revision is allowed. Failed drafts remain failed. Successful plans enter the render queue; they are not labeled finished until their actual MP4 is saved. The older custom-topic form continues to produce research/script drafts only.

The renderer uses six original cartoon layouts, seven characters/props, four synthetic voices, animated expressions, burned-in captions, original synthesized music and scene sound effects. Models produce bounded scene JSON; they cannot supply executable render code. Recurring production assets support distinct situations and punchlines.

### Rendering without another hosted server

[Daily video production](.github/workflows/daily-production.yml) runs in GitHub Actions hourly, on relevant pushes to main, and manually. It installs rendering dependencies only when there is work. It claims up to two plans, synthesizes speech, renders 1080×1920/30fps H.264/AAC MP4s, verifies full decoding, measured duration, caption bounds, loudness and peak levels, then uploads the MP4, poster and technical report to R2. MP4 streaming supports byte ranges for dashboard playback. Captions use measured speech-beat durations and estimated phrase boundaries, not forced word alignment.

The runner authenticates with short-lived GitHub OIDC tokens. The Worker checks the issuer, signature, audience, expiry, immutable repository/owner IDs, main branch, exact workflow path and allowed event. No render password or Cloudflare API key is stored in GitHub. A 45-minute claim lease prevents concurrent workers from finishing the same job. Expired leases and failed runs retry up to three times. Completion verifies that the report's SHA-256 matches the uploaded MP4 and is idempotent if the response is lost.

GitHub identity reference: https://docs.github.com/en/actions/concepts/security/openid-connect

Worker cron reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/

The verified existing Worker URL is `https://techfieldtest.justing0406.workers.dev`. Set the repository variable `WORKER_URL` if it changes. Set Worker variable `DAILY_ENABLED=false` to pause new automatic daily jobs. Existing render work can still drain. Hourly cron and GitHub Actions are polling schedules, not exact delivery-time guarantees. GitHub-hosted scheduling, Actions availability/quotas and Cloudflare usage must remain available.

### Final review

Finished videos appear inline with download links. Approval/rejection requires an owner key so a public visitor cannot approve a video. Configure `OWNER_TOKEN` as a Cloudflare Worker secret, then enter that value in the dashboard's password field. It stays in page memory and is not saved in browser storage. The dashboard explicitly reports when this key is not configured. Approval saves a decision only and never publishes. Rejection records feedback; regenerate creates a separate revision while preserving the original. Restrict the control room with Cloudflare Access if you want its previews and generation endpoints private.

New API routes: `GET /api/daily`, `POST /api/daily/run`, `GET|HEAD /api/videos/<uuid>/video`, `GET /api/videos/<uuid>/poster`, `GET /api/videos/<uuid>/qa`, and owner-authenticated `POST /api/videos/<uuid>/review` with `{decision: 'approved' | 'rejected', note: string}`. Renderer-only claim/upload/complete/fail routes live under `/api/renderer/`.

[Renderer setup and local reproduction](renderer/README.md).

## Existing custom research/script workflow

Enter a topic and click **Generate video job**. The Worker saves a D1 record and R2 brief, then starts a durable Cloudflare Workflow. It reads source pages, extracts source-backed facts, and generates a timed 30–45 second script using Workers AI. The dashboard polls progress and displays **Script ready for review** when the draft is saved. Click **Read script** for narration, captions, scene timing, visual directions and source links.

This milestone creates a research packet and script, not an MP4. Voice, rendering and publishing are not connected yet. Every draft requires human review. Hands-on testing claims are blocked because tests have not yet been performed.

### Research scope

Meeting-note topics use official Otter and Fathom pricing pages, Fireflies limits documentation, and Granola and tl;dv product pages as the initial source catalog. Other topics require 2–5 source URLs in the dashboard. Prefer product and documentation pages. This version fetches those pages; it does not perform an open-web search or operate the products.

At least two pages must be readable. Failed pages are listed in the research packet and draft; blocked or JavaScript-only pages may need a different URL. Source URLs and redirects are validated, page reads are bounded, and scripts, navigation and styles are removed from the source text. Each source has its retrieval time and a SHA-256 hash of the extracted excerpt.

Workers AI extracts several decision-relevant facts per product, up to four per source, with exact evidence quotes totaling at most 25 unique words per source. The Worker verifies those quotes against the fetched pages. The writer then chooses one angle and focuses on two or three relevant products, with a specific hook, concrete contrasts and a useful conditional takeaway.

Draft validation checks scene lengths, total duration, spoken word count, fact references and unsupported testing claims. Additional checks reject generic productivity introductions, empty endings, section-label captions and repeated product-page visuals. A separate model call reviews support and editorial usefulness; a failed draft receives feedback and one rewrite. A draft that still fails is marked failed instead of ready. Automated checks do not establish real-world product quality or prove semantic correctness. Review prices, plan context and comparisons before publishing.

### Generation and limits

The native `AI` binding uses `@cf/openai/gpt-oss-120b`. No separate API key is required. The `PRODUCTION` Workflow binding survives closing the dashboard and retries each failed step once. Research, writing and editorial review consume Workers AI and Workflows usage under your Cloudflare plan. One successful step uses one research call and up to two writer/editor pairs; workflow retries can add calls. Set `AI_MODEL` to change the model only to one supporting the same JSON-mode input.

An atomic D1 reservation limits the project to 10 research starts per UTC day by default (`MAX_RUNS_PER_DAY` in `wrangler.jsonc`). A capped job stays saved and can be started the next day. An idempotent Workflow submission prevents double runs when a request is retried. Previously saved queued jobs have a **Start research** button; their meeting-tool sources are selected automatically. Failed production runs retain their error and any completed research.

Click **Regenerate script** on a ready or failed job to create a fresh revision. It preserves the original job and script, links the new brief to the original ID, and counts toward the same daily limit. Old default meeting sources are refreshed to the current catalog; custom URLs are retained. Request retries reuse the same revision ID.

### Storage

- `DB`: D1 database `techfieldtest-db`, containing `videos` and `production_runs`.
- `ASSETS`: R2 bucket `techfieldtest-assets`, containing `jobs/<uuid>/brief.json`, `research.json` and `script.json`. Future narration, screenshots and MP4s can use that same per-job prefix.

The Worker marks a job queued only after its R2 brief is saved. Storage failures retain a failed record in the queue; create a new job to retry. A crashed or interrupted request can leave a job marked Saving, so the UI does not report it as ready.

## Cloudflare deployment

Your existing GitHub -> Cloudflare Workers Builds integration can keep its `npx wrangler deploy` command. Wrangler is pinned and a lockfile is included.

The configuration deliberately omits resource IDs. Wrangler's [automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/) creates or links the D1 and R2 bindings during deployment and reuses the linked resources on subsequent deploys. It may update the build's local config with IDs; committing those IDs is not required to preserve the bindings.

The additive schemas in `migrations/0001_jobs.sql`, `0002_production.sql` and `0003_daily.sql` are bundled with the Worker and applied with `CREATE ... IF NOT EXISTS` on first storage use. Existing jobs are preserved. This deployment works with the existing deploy command without a separate migration step. Future non-additive schema changes must use versioned migrations.

After the build succeeds, open `/api/health`. Expect HTTP 200 and:

```json
{"status":"ok","version":"0.5.0","storage":{"d1":true,"r2":true},"pipeline":{"ai":true,"workflow":true}}
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

Tests bundle the Worker and use Miniflare's actual D1, R2 and Workflow implementations. Model replies and fetched page content are fixtures. They cover job creation, persistence, idempotency, input validation, missing bindings, R2 failure, source extraction, evidence matching, script validation, editorial rejection and rewriting, supported model response formats, workflow success/failure, regeneration preserving the original, existing jobs and the daily cap. They do not call a live model or establish real-world product quality.

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
| `POST /api/videos/<uuid>/regenerate` | Creates a revision of a ready or failed job while preserving the original; 201 new / 200 reused |
| `GET /api/videos/<uuid>/brief` | Streams the job's JSON brief from R2 |
| `GET /api/videos/<uuid>/research` | Saved source excerpts, evidence facts, uncertainties and test plan |
| `GET /api/videos/<uuid>/script` | Timed draft with narration, captions, visuals, fact references and sources |

`POST /api/generate` accepts `{"topic":"What should we test?","sourceUrls":["https://vendor.com/product","https://vendor.com/docs"]}`. Topic length: 1–240 characters. Omit `sourceUrls` for meeting-tool topics. Supply a version 4 UUID in `Idempotency-Key` for safe retries; the dashboard does this automatically. Empty requests use the default meeting topic and a generated UUID. Malformed input returns 400 and cross-site browser requests return 403. A saved job still returns 201 if workflow submission hits a cap or fails; inspect `pipeline.started`, `pipeline.error` and `pipeline.code`. The dashboard shows the message and lets you retry starting queued work.

The same-origin check blocks cross-site browser submissions; it does not authenticate users. The control room and artifact API are currently accessible to anyone who knows their URLs, with a global generation cap. Cloudflare Access can restrict the whole Worker to the owner.

## Next milestone

Connect current small-creator breakout research and comments, platform account publishing, and age-matched performance snapshots. Track retention, sharing, following, attributable revenue and production costs. Keep production and feedback versioned; do not invent analytics or claim a physical test from cartoon illustrations.
