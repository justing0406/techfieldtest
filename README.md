# TechFieldTest

TechFieldTest is an automated tech-testing media project for TikTok, Instagram Reels, and YouTube Shorts.

## V1 milestone

The first milestone is deliberately small: prove the deployment loop and provide a control panel for the future content pipeline.

Current routes:

- `GET /` — TechFieldTest dashboard
- `GET /api/health` — deployment health check
- `GET /api/videos` — current content queue
- `POST /api/generate` — placeholder for the video-generation pipeline

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

Cloudflare is connected to this repository, so commits to the configured production branch can deploy automatically.

## Next milestone

Add D1 + R2, then connect the first real workflow:

research → idea → script → fact check → voice → visuals → render → approval.
