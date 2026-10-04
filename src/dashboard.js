export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#07111f" />
  <title>TechFieldTest — Control Room</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: rgba(14, 28, 47, .78);
      --line: rgba(148, 163, 184, .16);
      --text: #f8fafc;
      --muted: #94a3b8;
      --blue: #22b7ff;
      --blue2: #2474ff;
      --good: #3ddc97;
      --warn: #f7c65c;
      --shadow: 0 26px 70px rgba(0,0,0,.24);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 12% 0%, rgba(34,183,255,.18), transparent 30rem),
        radial-gradient(circle at 90% 4%, rgba(36,116,255,.16), transparent 34rem),
        var(--bg);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .14;
      background-image:
        linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: linear-gradient(to bottom, black, transparent 72%);
    }
    button { font: inherit; }
    .topic-label { display:block; color:#b9c7d9; font-size:12px; margin-bottom:8px; }
    .topic-input { display:block; width:100%; max-width:630px; background:#07111f; border:1px solid var(--line); border-radius:12px; padding:12px; color:var(--text); font:inherit; margin-bottom:15px; position:relative; z-index:2; }
    .job { padding:20px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; }
    .job h3 { margin:0 0 8px; font-size:15px; overflow-wrap:anywhere; }
    .job p { margin:0; color:var(--muted); font-size:12px; }
    .job a { color:#7dd3fc; font-size:12px; }
    .job-side { text-align:right; flex-shrink:0; }
    .job-side a { display:block; margin-top:10px; }
    .job-error { color:#fde7a9; margin-top:8px; font-size:12px; }
    .draft-preview { margin-top:18px; max-width:680px; font-size:13px; line-height:1.7; }
    .draft-preview h4 { font-size:16px; margin:10px 0; }
    .draft-preview li { margin-bottom:16px; }
    .draft-preview a { margin-right:8px; }
    .video-preview { display:block; width:230px; max-width:100%; aspect-ratio:9/16; border-radius:16px; background:#000; margin-top:16px; }
    .daily-controls { padding:22px; margin-bottom:24px; }
    .daily-controls p { color:var(--muted); font-size:13px; line-height:1.6; }
    .secondary { border:1px solid var(--line); background:#14253c; color:#7dd3fc; padding:8px 12px; border-radius:8px; cursor:pointer; display:block; margin-top:10px; }
    @media(max-width:520px) { .job { flex-direction:column; } .job-side { text-align:left; } }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 30px 0 64px; position: relative; z-index: 1; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:40px; }
    .brand { display:flex; align-items:center; gap:13px; font-weight:800; letter-spacing:-.02em; }
    .mark { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:linear-gradient(135deg,var(--blue),var(--blue2)); box-shadow:0 10px 30px rgba(34,183,255,.28); color:white; font-size:16px; letter-spacing:-.06em; }
    .brand small { display:block; color:var(--muted); font-size:11px; font-weight:650; letter-spacing:.16em; text-transform:uppercase; margin-top:2px; }
    .pill { display:inline-flex; align-items:center; gap:8px; border:1px solid var(--line); background:rgba(15,23,42,.58); color:#cbd5e1; padding:9px 12px; border-radius:999px; font-size:12px; font-weight:700; }
    .dot { width:8px; height:8px; border-radius:50%; background:var(--good); box-shadow:0 0 0 5px rgba(61,220,151,.10); }
    .hero { display:grid; grid-template-columns:1.35fr .65fr; gap:22px; margin-bottom:24px; }
    .card { border:1px solid var(--line); background:linear-gradient(180deg,rgba(17,34,57,.86),rgba(10,23,39,.80)); border-radius:22px; box-shadow:var(--shadow); backdrop-filter:blur(16px); }
    .hero-main { padding:34px; min-height:275px; position:relative; overflow:hidden; }
    .hero-main::after { content:""; position:absolute; width:270px; height:270px; right:-84px; bottom:-120px; border-radius:50%; border:34px solid rgba(34,183,255,.11); }
    .eyebrow { margin:0 0 12px; color:#7dd3fc; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; }
    h1 { max-width:680px; margin:0; font-size:clamp(34px,6vw,58px); line-height:1.02; letter-spacing:-.055em; }
    .hero-copy { max-width:640px; margin:18px 0 26px; color:#b9c7d9; font-size:15px; line-height:1.7; }
    .primary { position:relative; z-index:2; border:0; border-radius:13px; padding:13px 18px; color:white; background:linear-gradient(135deg,var(--blue),var(--blue2)); cursor:pointer; font-weight:800; box-shadow:0 12px 30px rgba(36,116,255,.27); transition:transform .16s ease,filter .16s ease; }
    .primary:hover { transform:translateY(-1px); filter:brightness(1.06); }
    .primary:disabled { cursor:wait; opacity:.7; }
    .hero-side { padding:26px; display:flex; flex-direction:column; justify-content:space-between; }
    .hero-side h2,.section-title h2 { margin:0; font-size:15px; letter-spacing:-.01em; }
    .pipeline { display:grid; gap:9px; margin-top:18px; }
    .step { display:flex; align-items:center; gap:10px; color:#cbd5e1; font-size:13px; }
    .step span { width:23px; height:23px; border:1px solid var(--line); border-radius:7px; display:grid; place-items:center; color:#7dd3fc; font-size:10px; font-weight:800; }
    .mini-note { margin-top:18px; color:var(--muted); font-size:12px; line-height:1.5; }
    .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
    .metric { padding:20px; min-height:118px; }
    .metric-label { color:var(--muted); font-size:12px; font-weight:700; margin-bottom:16px; }
    .metric-value { font-size:31px; line-height:1; font-weight:850; letter-spacing:-.04em; }
    .metric-sub { margin-top:10px; color:#64748b; font-size:11px; }
    .queue { padding:24px; }
    .section-title { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:18px; border-bottom:1px solid var(--line); }
    .section-title p { margin:5px 0 0; color:var(--muted); font-size:12px; }
    .empty { min-height:260px; display:grid; place-items:center; text-align:center; padding:35px 20px; }
    .empty-icon { width:54px; height:54px; margin:0 auto 16px; display:grid; place-items:center; border-radius:16px; border:1px solid rgba(34,183,255,.22); background:rgba(34,183,255,.08); color:#7dd3fc; font-size:22px; }
    .empty h3 { margin:0 0 8px; font-size:16px; }
    .empty p { max-width:430px; margin:0; color:var(--muted); line-height:1.6; font-size:13px; }
    .notice { display:none; margin-top:15px; max-width:630px; padding:12px 14px; border-radius:12px; border:1px solid rgba(247,198,92,.25); background:rgba(247,198,92,.08); color:#fde7a9; font-size:12px; line-height:1.5; }
    .notice.show { display:block; }
    footer { display:flex; justify-content:space-between; gap:20px; padding-top:22px; color:#52637a; font-size:11px; }
    @media (max-width:860px) { .hero { grid-template-columns:1fr; } .metrics { grid-template-columns:repeat(2,1fr); } }
    @media (max-width:520px) { .shell { width:min(100% - 20px,1180px); padding-top:18px; } .topbar { align-items:flex-start; margin-bottom:26px; } .brand small { display:none; } .pill { font-size:10px; } .hero-main { padding:26px 22px; } .hero-side,.queue { padding:20px; } .metrics { grid-template-columns:1fr 1fr; gap:10px; } .metric { padding:16px; min-height:106px; } footer { flex-direction:column; gap:6px; } }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><div class="mark">TFT</div><div>TechFieldTest<small>Control Room</small></div></div>
      <div class="pill"><span class="dot"></span><span id="deployStatus">Worker online</span></div>
    </header>

    <section class="hero">
      <article class="card hero-main">
        <p class="eyebrow">V5 · Daily video production</p>
        <h1>Make something worth sending.</h1>
        <p class="hero-copy">Two daily drafts built around relatable situations, useful payoffs and weird little jokes. Preview the finished videos here before approving them.</p>
        <form id="generateForm">
          <label class="topic-label" for="topic">What should we test?</label>
          <input class="topic-input" id="topic" maxlength="240" required value="Which free meeting note taker fits your meetings?" />
          <label class="topic-label" for="sourceUrls">Source pages (optional for meeting tools; 2–5 URLs for other topics)</label>
          <textarea class="topic-input" id="sourceUrls" rows="2" maxlength="3000" placeholder="One product or documentation URL per line"></textarea>
          <button class="primary" id="generateBtn" type="submit">+ Research a custom topic</button>
        </form>
        <div class="notice" id="notice" role="status" aria-live="polite"></div>
      </article>

      <aside class="card hero-side">
        <div>
          <h2>Target pipeline</h2>
          <div class="pipeline">
            <div class="step"><span>1</span> Research + choose a test</div>
            <div class="step"><span>2</span> Script + fact check</div>
            <div class="step"><span>3</span> Voice + visuals</div>
            <div class="step"><span>4</span> Render vertical video</div>
            <div class="step"><span>5</span> Human approval</div>
            <div class="step"><span>6</span> Publish + measure</div>
          </div>
        </div>
        <div class="mini-note">Publishing and platform analytics are not connected yet. Fresh competitor discovery comes next.</div>
      </aside>
    </section>

    <section class="card daily-controls">
      <h2>Daily production</h2>
      <p id="dailyStatus">Loading today's queue...</p>
      <button class="primary" id="dailyRun" type="button">Make today's two drafts</button>
      <p>Automatic production starts after 6 AM New York time. A three-day review buffer keeps the queue manageable.</p>
      <label class="topic-label" for="ownerKey">Owner approval key</label>
      <input class="topic-input" type="password" autocomplete="off" id="ownerKey" placeholder="Enter your configured key to approve finished videos" />
      <p id="approvalStatus">Loading approval settings...</p>
    </section>
    <section class="metrics">
      <article class="card metric"><div class="metric-label">Jobs today</div><div class="metric-value" id="videosToday">0</div><div class="metric-sub">America/New_York</div></article>
      <article class="card metric"><div class="metric-label">Drafts ready for review</div><div class="metric-value" id="awaitingApproval">0</div><div class="metric-sub">Scripts and finished videos</div></article>
      <article class="card metric"><div class="metric-label">Published</div><div class="metric-value" id="published">0</div><div class="metric-sub">Across all platforms</div></article>
      <article class="card metric"><div class="metric-label">Revenue</div><div class="metric-value">—</div><div class="metric-sub">Tracking not connected</div></article>
    </section>

    <section class="card queue">
      <div class="section-title"><div><h2>Content queue</h2><p>Latest 100 jobs. Progress updates automatically.</p></div><div class="pill" id="queueCount">Loading…</div></div>
      <div id="queue" aria-live="polite"><div class="empty"><p>Loading your jobs…</p></div></div>
    </section>

    <footer><span>TechFieldTest · Relatable stories. Useful payoffs.</span><span id="apiStatus">Checking API…</span></footer>
  </main>

  <script>
    const apiStatus = document.getElementById("apiStatus");
    const deployStatus = document.getElementById("deployStatus");
    const generateBtn = document.getElementById("generateBtn");
    const notice = document.getElementById("notice");
    let requestId = null;
    let pendingTopic = null;
    let pendingSources = null;
    const openDrafts = new Set();
    const draftCache = new Map();
    const regenerateIds = new Map();
    let refreshing = false;
    const playingVideos = new Set();
    const videoPositions = new Map();
    const reviewFeedback = new Map();
    let approvalEnabled = false;
    const labels = { creating: "Saving", queued: "Waiting for research", researching: "Researching sources", scripting: "Writing script", rendering: "Rendering", awaiting_approval: "Script ready for review", approved: "Approved", published: "Published", failed: "Needs attention" };

    function showDraft(parent, draft) {
      parent.replaceChildren();
      const title = document.createElement("h4"); title.textContent = draft.title;
      const note = document.createElement("p"); note.textContent = draft.reviewNote + " Estimated duration: " + draft.durationSeconds + " seconds.";
      parent.append(title, note);
      if (draft.selectedConcept) { const why = document.createElement("p"); why.textContent = "Why watch: " + draft.selectedConcept.watchReason + " · Why send: " + draft.selectedConcept.shareReason; parent.append(why); }
      const scenes = document.createElement("ol");
      for (const scene of draft.scenes) {
        const item = document.createElement("li");
        const timing = document.createElement("strong"); timing.textContent = scene.startSeconds + "–" + scene.endSeconds + "s · " + scene.caption;
        const narration = document.createElement("p"); narration.textContent = scene.narration;
        const visual = document.createElement("p"); visual.textContent = "Visual: " + scene.visual;
        item.append(timing, narration, visual);
        for (const factId of scene.factIds) {
          const fact = draft.facts.find(f => f.id === factId);
          const source = draft.sources.find(s => s.id === fact.sourceId);
          const link = document.createElement("a"); link.href = source.url; link.target = "_blank"; link.rel = "noopener"; link.textContent = source.title; link.title = fact.claim + " | Evidence: " + fact.quote; item.append(link);
        }
        scenes.append(item);
      }
      parent.append(scenes);
      const checks = document.createElement("p"); checks.textContent = "Needs checking: " + draft.uncertainties.join(" · "); parent.append(checks);
      if (!draft.plan) { const plan = document.createElement("p"); plan.textContent = "Future hands-on test: " + draft.testPlan.join(" · "); parent.append(plan); }
      if (draft.sourceFailures.length) { const failures = document.createElement("p"); failures.textContent = draft.sourceFailures.length + " source page(s) could not be read. Check the research file for details."; parent.append(failures); }
    }

    async function refreshQueue() {
      if (playingVideos.size || ["TEXTAREA","INPUT"].includes(document.activeElement?.tagName)) return;
      const dailyResponse = await fetch("/api/daily");
      const daily = await dailyResponse.json();
      if (!dailyResponse.ok) throw new Error(daily.error || "Daily queue unavailable");
      approvalEnabled = daily.approvalEnabled;
      document.getElementById("dailyStatus").textContent = (daily.enabled ? "Daily production on" : "Daily production paused") + " · " + daily.slots.length + "/2 jobs reserved today · " + daily.backlog + "/6 videos in the render/review buffer";
      document.getElementById("approvalStatus").textContent = approvalEnabled ? "Approval saves your decision; publishing is not connected." : "Finished previews work now. Approval needs an owner key configured once.";
      const response = await fetch("/api/videos");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load jobs");
      // Playback may start while the polling requests are still in flight.
      if (playingVideos.size || ["TEXTAREA","INPUT"].includes(document.activeElement?.tagName)) return;
      document.getElementById("videosToday").textContent = data.summary.videosToday;
      document.getElementById("awaitingApproval").textContent = data.summary.awaitingApproval;
      document.getElementById("published").textContent = data.summary.published;
      document.getElementById("queueCount").textContent = data.summary.queued + " queued";
      const queue = document.getElementById("queue");
      queue.replaceChildren();
      if (!data.videos.length) {
        const empty = document.createElement("div"); empty.className = "empty";
        const text = document.createElement("p"); text.textContent = "No jobs yet. Choose a test above to create your first production brief.";
        empty.append(text); queue.append(empty);
      }
      for (const video of data.videos) {
        const row = document.createElement("article"); row.className = "job";
        const main = document.createElement("div");
        const title = document.createElement("h3"); title.textContent = video.topic;
        const meta = document.createElement("p"); meta.textContent = new Date(video.createdAt).toLocaleString() + " · " + video.id.slice(0, 8);
        main.append(title, meta);
        if (video.videoUrl) {
          const player = document.createElement("video"); player.className = "video-preview"; player.controls = true; player.preload = "none"; player.playsInline = true; player.src = video.videoUrl; player.poster = video.posterUrl;
          player.addEventListener("play", () => playingVideos.add(video.id));
          player.addEventListener("timeupdate", () => videoPositions.set(video.id, player.currentTime));
          player.addEventListener("loadedmetadata", () => { if (videoPositions.has(video.id)) player.currentTime = videoPositions.get(video.id); });
          for (const event of ["pause", "ended"]) player.addEventListener(event, () => playingVideos.delete(video.id));
          main.append(player);
          const download = document.createElement("a"); download.href = video.videoUrl; download.textContent = "Download MP4"; download.download = "techfieldtest-" + video.id.slice(0, 8) + ".mp4"; main.append(download);
          if (!video.review) {
            const feedback = document.createElement("textarea"); feedback.className = "topic-input"; feedback.maxLength = 500; feedback.rows = 2; feedback.placeholder = "What should improve?";
            feedback.value = reviewFeedback.get(video.id) || ""; feedback.addEventListener("input", () => reviewFeedback.set(video.id, feedback.value));
            main.append(feedback);
            for (const decision of ["approved", "rejected"]) {
              const button = document.createElement("button"); button.className = "secondary"; button.textContent = decision === "approved" ? "Approve finished video" : "Reject + save feedback"; button.disabled = !approvalEnabled;
              button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                  const response = await fetch("/api/videos/" + video.id + "/review", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + document.getElementById("ownerKey").value }, body: JSON.stringify({ decision, note: feedback.value }) });
                  const result = await response.json(); if (!response.ok) throw new Error(result.error);
                  notice.textContent = decision === "approved" ? "Video approved. It has not been published." : "Feedback saved. Regenerate to create another draft."; notice.classList.add("show"); await refreshQueue();
                } catch (error) { notice.textContent = error.message; notice.classList.add("show"); button.disabled = false; }
              }); main.append(button);
            }
          }
          if (video.reviewNote) { const feedback = document.createElement("p"); feedback.textContent = "Review: " + video.reviewNote; main.append(feedback); }
        }
        if (video.error) { const error = document.createElement("div"); error.className = "job-error"; error.textContent = video.error; main.append(error); }
        if (video.scriptUrl) {
          const preview = document.createElement("div"); preview.className = "draft-preview"; preview.hidden = !openDrafts.has(video.id);
          const button = document.createElement("button"); button.className = "secondary"; button.textContent = preview.hidden ? "Read script" : "Hide script";
          if (draftCache.has(video.id)) showDraft(preview, draftCache.get(video.id));
          button.addEventListener("click", async () => {
            if (!preview.hidden) { preview.hidden = true; openDrafts.delete(video.id); button.textContent = "Read script"; return; }
            button.disabled = true;
            try {
              if (!draftCache.has(video.id)) { const response = await fetch(video.scriptUrl); const draft = await response.json(); if (!response.ok) throw new Error(draft.error); draftCache.set(video.id, draft); }
              showDraft(preview, draftCache.get(video.id)); preview.hidden = false; openDrafts.add(video.id); button.textContent = "Hide script";
            } catch (error) { preview.textContent = error.message; preview.hidden = false; }
            finally { button.disabled = false; }
          });
          main.append(button, preview);
        }
        if (["awaiting_approval","failed"].includes(video.status)) {
          const regenerate = document.createElement("button"); regenerate.className = "secondary"; regenerate.textContent = "Regenerate script";
          regenerate.addEventListener("click", async () => {
            if (!regenerateIds.has(video.id)) regenerateIds.set(video.id, crypto.randomUUID());
            regenerate.disabled = true; regenerate.textContent = "Starting new draft…";
            try {
              const response = await fetch("/api/videos/" + video.id + "/regenerate", { method: "POST", headers: { "Idempotency-Key": regenerateIds.get(video.id) } });
              const result = await response.json(); if (!response.ok) throw new Error(result.error);
              regenerateIds.delete(video.id); notice.textContent = result.message; notice.classList.add("show"); await refreshQueue();
            } catch (error) { notice.textContent = error.message; notice.classList.add("show"); regenerate.disabled = false; regenerate.textContent = "Regenerate script"; }
          }); main.append(regenerate);
        }
        const side = document.createElement("div"); side.className = "job-side";
        const status = document.createElement("span"); status.className = "pill"; status.textContent = video.status === "awaiting_approval" && video.videoUrl ? "Video ready for review" : video.status === "rendering" && video.renderStatus === "pending" ? "Waiting for render worker" : labels[video.status] || video.status;
        side.append(status);
        if (video.status === "queued") {
          const start = document.createElement("button"); start.className = "secondary"; start.textContent = "Start research";
          start.addEventListener("click", async () => {
            start.disabled = true;
            try { const response = await fetch("/api/videos/" + video.id + "/start", { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); notice.textContent = result.message; notice.classList.add("show"); await refreshQueue(); }
            catch (error) { notice.textContent = error.message; notice.classList.add("show"); start.disabled = false; }
          }); side.append(start);
        }
        if (video.status !== "creating" && video.status !== "failed") {
          const link = document.createElement("a"); link.href = video.briefUrl; link.textContent = "View production brief"; link.target = "_blank"; link.rel = "noopener"; side.append(link);
        }
        if (video.researchUrl) { const link = document.createElement("a"); link.href = video.researchUrl; link.textContent = "Sources + evidence"; link.target = "_blank"; link.rel = "noopener"; side.append(link); }
        row.append(main, side); queue.append(row);
      }
    }

    async function boot() {
      try {
        const healthResponse = await fetch("/api/health");
        const health = await healthResponse.json();
        if (!healthResponse.ok) throw new Error(health.message || "Storage needs setup");
        await refreshQueue();
        apiStatus.textContent = "Storage ready · " + health.version;
        deployStatus.textContent = "Ready for jobs";
      } catch (error) {
        apiStatus.textContent = error.message;
        deployStatus.textContent = "Needs attention";
        document.getElementById("queue").textContent = "Jobs could not load. " + error.message;
        document.getElementById("queueCount").textContent = "Unavailable";
      }
    }

    document.getElementById("generateForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const topic = document.getElementById("topic").value.trim();
      const sourceUrls = document.getElementById("sourceUrls").value.split(/\\s+/).filter(Boolean);
      if (!topic) return;
      if (pendingTopic !== topic || pendingSources !== JSON.stringify(sourceUrls) || !requestId) { requestId = crypto.randomUUID(); pendingTopic = topic; pendingSources = JSON.stringify(sourceUrls); }
      generateBtn.disabled = true;
      generateBtn.textContent = "Saving job…";
      notice.classList.remove("show");
      try {
        const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify({ topic, sourceUrls }) });
        const result = await response.json();
        if (!response.ok) {
          if (result.video && result.video.status === "failed") requestId = null;
          throw new Error(result.error || "Could not save job");
        }
        requestId = null;
        notice.textContent = result.message;
        notice.classList.add("show");
        await refreshQueue();
      } catch (error) {
        notice.textContent = error.message + " You can retry.";
        notice.classList.add("show");
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "+ Research a custom topic";
      }
    });

    document.getElementById("dailyRun").addEventListener("click", async event => {
      event.target.disabled = true;
      try {
        const response = await fetch("/api/daily/run", { method: "POST" }); const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        notice.textContent = "Today's queue checked. Existing daily jobs are reused; new drafts will appear here."; notice.classList.add("show"); await refreshQueue();
      } catch (error) { notice.textContent = error.message; notice.classList.add("show"); }
      finally { event.target.disabled = false; }
    });
    boot();
    setInterval(async () => {
      if (document.hidden || refreshing || generateBtn.disabled) return;
      refreshing = true;
      try { await refreshQueue(); } catch (error) { apiStatus.textContent = error.message; }
      finally { refreshing = false; }
    }, 5000);
  </script>
</body>
</html>`;
