# Reusable daily renderer

This renderer turns validated scene JSON into original animated vertical videos.
It reuses the cartoon style and included voices from the rain/fridge prototypes.
The writing model cannot execute Python or request arbitrary external assets.

Install Python 3.12, FFmpeg, espeak-ng, libseccomp2 and DejaVu fonts on Linux.
Install `requirements.txt` in a virtual environment. The GitHub workflow does
this only when a script is ready to render.

The `runner.py` model downloader retrieves the two files from the official
kokoro-onnx `model-files-v1.1` release and verifies fixed SHA-256 checksums.
Models are cached; they are not committed. Kokoro is Apache 2.0 licensed and
kokoro-onnx is MIT licensed. All characters, music and effects are original.
Included synthetic voices are not clones of a real person. Narration runs
offline in a subprocess after model acquisition.

For local production, prepare a `project.json` with the schema emitted by
`src/creative.js`, and place the two verified models in `WORK/models/`:

```bash
python renderer/narration.py --project WORK/project.json --work WORK
python renderer/render.py --work WORK --output WORK/video.mp4 --stills-only
python renderer/render.py --work WORK --output WORK/video.mp4
python renderer/qa.py --work WORK --video WORK/video.mp4
```

Inspect `WORK/contact-sheet.jpg` before encoding. Final QA decodes the entire
encoded video; checks actual resolution, fps and codecs; compares the encoded
duration with the measured speech timeline; verifies caption/text bounds; and
measures integrated loudness and true peak. Accepted duration is 20–45 seconds,
loudness -18 to -14 LUFS, and true peak at most -1 dBFS. The MP4 upload is capped
at 50 MiB. These checks establish technical readiness, not entertainment,
factual interpretation, cooking success, benchmark results or virality.

Daily Actions runner commands:

```bash
python renderer/runner.py claim --work render-work
python renderer/runner.py run --work render-work
```

They require a GitHub Actions OIDC environment and `WORKER_URL`. The request
token and signed identity token stay in process memory and are never printed.
An authorized runner uploads the MP4 and JPEG before completion. The Worker
checks the video hash and technical report before exposing a finished preview.
Failed jobs are retried at most three times. Final decisions require owner
authorization; this milestone never uploads to social platforms.
