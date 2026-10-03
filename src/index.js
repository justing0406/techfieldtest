const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const dashboardHtml = `<!doctype html>
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
        <p class="eyebrow">V1 · Production engine</p>
        <h1>Test tech. Make the video. Learn what works.</h1>
        <p class="hero-copy">This is the control panel for the TechFieldTest content engine. The deployment shell is live. Next we will connect research, scripting, voice, rendering, approval, publishing, and analytics.</p>
        <button class="primary" id="generateBtn">+ Generate first video</button>
        <div class="notice" id="notice"></div>
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
        <div class="mini-note">Nothing auto-publishes in V1. Approval stays human until the content engine proves reliable.</div>
      </aside>
    </section>

    <section class="metrics">
      <article class="card metric"><div class="metric-label">Videos today</div><div class="metric-value" id="videosToday">0</div><div class="metric-sub">Production target: 2/day</div></article>
      <article class="card metric"><div class="metric-label">Awaiting approval</div><div class="metric-value" id="awaitingApproval">0</div><div class="metric-sub">Human checkpoint enabled</div></article>
      <article class="card metric"><div class="metric-label">Published</div><div class="metric-value" id="published">0</div><div class="metric-sub">Across all platforms</div></article>
      <article class="card metric"><div class="metric-label">Revenue</div><div class="metric-value">$0</div><div class="metric-sub">Revenue tracking comes later</div></article>
    </section>

    <section class="card queue">
      <div class="section-title"><div><h2>Content queue</h2><p>Ideas and rendered videos will appear here.</p></div><div class="pill">0 queued</div></div>
      <div class="empty"><div><div class="empty-icon">＋</div><h3>No videos yet</h3><p>Your first real item will appear here after we connect D1 and the generation workflow.</p></div></div>
    </section>

    <footer><span>TechFieldTest · Real tech. Real tests. Real answers.</span><span id="apiStatus">Checking API…</span></footer>
  </main>

  <script>
    const apiStatus = document.getElementById("apiStatus");
    const deployStatus = document.getElementById("deployStatus");
    const generateBtn = document.getElementById("generateBtn");
    const notice = document.getElementById("notice");

    async function boot() {
      try {
        const [healthResponse, videosResponse] = await Promise.all([fetch("/api/health"), fetch("/api/videos")]);
        if (!healthResponse.ok || !videosResponse.ok) throw new Error("API check failed");
        const health = await healthResponse.json();
        const queue = await videosResponse.json();
        apiStatus.textContent = "API healthy · " + health.version;
        deployStatus.textContent = "Worker online";
        document.getElementById("videosToday").textContent = queue.summary.videosToday;
        document.getElementById("awaitingApproval").textContent = queue.summary.awaitingApproval;
        document.getElementById("published").textContent = queue.summary.published;
      } catch (error) {
        apiStatus.textContent = "API unavailable";
        deployStatus.textContent = "Needs attention";
      }
    }

    generateBtn.addEventListener("click", async () => {
      generateBtn.disabled = true;
      generateBtn.textContent = "Starting…";
      notice.classList.remove("show");
      try {
        const response = await fetch("/api/generate", { method: "POST" });
        const result = await response.json();
        notice.textContent = result.message;
        notice.classList.add("show");
      } catch (error) {
        notice.textContent = "The Worker could not reach the generation endpoint.";
        notice.classList.add("show");
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "+ Generate first video";
      }
    });

    boot();
  </script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        status: "ok",
        service: "techfieldtest",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/videos" && request.method === "GET") {
      return json({
        summary: { videosToday: 0, awaitingApproval: 0, published: 0 },
        videos: [],
      });
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      return json({
        status: "not_configured",
        message: "The dashboard is working. The next milestone is to connect D1, R2, and the first research → script → render job."
      }, 501);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(dashboardHtml, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
