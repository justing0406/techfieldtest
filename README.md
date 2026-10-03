# TechFieldTest

Control room for the TechFieldTest content pipeline: TikTok, Instagram Reels and YouTube Shorts.

## V0.2: persistent video jobs

Enter a topic and click **Generate video job**. The Worker creates a D1 record and an R2 production brief, then lists it as **Waiting for research**. Reloading the dashboard keeps the job. Repeating a request with the same `Idempotency-Key` returns the existing job instead of creating another one.

This milestone creates a production job, not an MP4. Research, scripts, voice, rendering and publishing are not connected yet. The brief requires human approval and recorded evidence before making hands-on testing claims.

### Storage

- `DB`: D1 database `techfieldtest-db`, containing the `videos` table and job status.
- `ASSETS`: private R2 bucket `techfieldtest-assets`, containing `jobs/<uuid>/brief.json`. Future narration, screenshots and MP4s can use that same per-job prefix.

The Worker marks a job queued only after its R2 brief is saved. Storage failures retain a failed record in the queue; create a new job to retry. A crashed or interrupted request can leave a job marked Saving, so the UI does not report it as ready.

## Cloudflare deployment

Your existing GitHub -> Cloudflare Workers Builds integration can keep its `npx wrangler deploy` command. Wrangler is pinned and a lockfile is included.

The configuration deliberately omits resource IDs. Wrangler's [automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/) creates or links the D1 and R2 bindings during deployment and reuses the linked resources on subsequent deploys. It may update the build's local config with IDs; committing those IDs is not required to preserve the bindings.

The additive initial schema in `migrations/0001_jobs.sql` is bundled with the Worker and applied with `CREATE ... IF NOT EXISTS` on first storage use. This makes the first deployment work with the existing deployment command, without a separate migration step. Existing rows are never reset. Future schema changes must use versioned migrations; only the initial schema is bootstrapped by the Worker.

After the build succeeds, open `/api/health`. Expect HTTP 200 and:

```json
{"status":"ok","version":"0.2.0","storage":{"d1":true,"r2":true}}
```

Then open the dashboard, create a job, refresh, and open **View production brief**.

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

Tests bundle the Worker and use Miniflare's actual D1 and R2 implementations. They cover creation, brief retrieval, persistence across runtime restart, idempotent retry, input validation, missing bindings and a simulated R2 outage.

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
| `POST /api/generate` | Persists a job and production brief; 201 new / 200 existing |
| `GET /api/videos/<uuid>/brief` | Streams the job's JSON brief from R2 |

`POST /api/generate` accepts `{"topic":"What should we test?"}`. Topic length: 1–240 characters. Supply a version 4 UUID in `Idempotency-Key` to make retries safe; the dashboard does this automatically. Empty requests use the default topic and a generated UUID. Malformed input returns 400, cross-site browser requests return 403, and unavailable storage returns 503.

The same-origin check blocks cross-site browser submissions; it does not authenticate users. The control room is currently accessible to anyone who knows its URL. Cloudflare Access can restrict the whole Worker before adding paid generation or private assets.

## Next milestone

Connect a research processor that picks up queued jobs, saves sources and test evidence, and produces a reviewable script. Then add voice, visuals, a vertical video renderer and an approval checkpoint.
