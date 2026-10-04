# First complete video prototype

`project.json` is the research and creative brief for TechFieldTest test 001:
**This black box doesn't hide your secret.** It targets people who share PDFs
at work with a surprising demonstration, a short visual metaphor and a useful
takeaway. Narration and all visuals are original. No competitor media is reused.

## Evidence and creative rationale

The format follows the immediate hook, intrigue and payoff described by Jenny
Hoyos in [YouTube's official interview](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/).
Two tech-prank Shorts provide comparable demand signals; their titles, links
and indexed metrics are in the project brief. Playback was unavailable, so this
is not a shot-by-shot competitor audit, and the metrics do not establish why
those videos succeeded. Audience and format choices remain hypotheses until
our account has retention, sharing and conversion results.

The demonstration uses a generated text-based PDF containing a fictional PIN.
The overlay and applied-redaction copies are independently read with PyMuPDF
and pypdf. Both find the PIN under an overlay, and neither finds it after
applied redaction. The video replays those verified files and results using
original graphics. It is not a recording of Acrobat or a general security
certification. See the Adobe redaction and sanitization sources in the brief;
checking extracted text does not prove that all hidden information is gone.

## Reproduce locally

The prototype requires Linux with libseccomp, Python 3.12, FFmpeg, and DejaVu fonts at
`/usr/share/fonts/truetype/dejavu/`. Install the packages listed in
`requirements.txt` in a virtual environment. Download the model and voices
from the [official kokoro-onnx release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1)
to a working directory's `models/` folder:

- `kokoro-v1.0.int8.onnx`
- `voices-v1.0.bin`

The narration process disables runtime telemetry and denies network syscalls
before loading its local inference engine. Download the model before starting
it. Kokoro's model is Apache 2.0 licensed; kokoro-onnx is MIT licensed. The voice
is an included synthetic voice, not a clone of a person. Sound effects and
the understated synth bed are generated locally by the renderer.

```bash
python production/evidence.py --work /absolute/path/video-work
python production/narration.py --work /absolute/path/video-work
python production/render.py --work /absolute/path/video-work --output /absolute/path/techfieldtest-001.mp4
```

The narration step saves each beat and an exact scene timeline. It reuses
cached clips on retry: clear `audio/` if the wording, speed, voice or model
changes. Narration captions are aligned by measured beat duration with
estimated phrase boundaries, not forced word alignment.

The renderer creates a 1080x1920, 30 fps H.264 MP4 with AAC audio, burned-in
captions, an SRT file and a scene contact sheet. The replay graphics are
clearly labeled as fake data and a verified test replay. Inspect the contact
sheet and decoded video frames, check audio levels, and preview the finished
video before approving publication.

## Integration status

This is a complete local production prototype. The deployed dashboard still
creates research and script drafts. These production scripts are not connected
to the Cloudflare Workflow, a render service or platform posting. Next, use the
approved video's quality target to connect research briefs, narration, media,
rendering, review and publishing. Do not report dashboard jobs as rendered
until a saved MP4 is actually present.

This first short is an audience-discovery experiment. It includes no affiliate
offer, fabricated sales, expected revenue, or promise of viral performance.
The system should later compare retention, shares, follows and attributable
revenue against production costs. Longer TikTok reward-eligible experiments
should be separately planned when that monetization route is relevant.
