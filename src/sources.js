export const LEGACY_MEETING_SOURCES = [
  'https://otter.ai/pricing', 'https://fireflies.ai/pricing',
  'https://www.fathom.ai/pricing', 'https://www.granola.ai/pricing', 'https://tldv.io/pricing/',
];
export const MEETING_SOURCES = [
  'https://otter.ai/pricing',
  'https://guide.fireflies.ai/articles/2631950139-learn-about-transcription-credits-storage-and-rate-limits-for-meetings',
  'https://www.fathom.ai/pricing', 'https://www.granola.ai/', 'https://tldv.io/',
];

export function refreshedSources(topic, urls) {
  const isLegacy = !urls?.length || (urls.length === LEGACY_MEETING_SOURCES.length && urls.every(url => LEGACY_MEETING_SOURCES.includes(url)));
  return selectSources(topic, isLegacy ? [] : urls);
}

export function publicSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 600) throw new Error('Source URLs must be public HTTPS pages.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Source URLs must be valid HTTPS URLs.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') ||
    /[\[\]:]/.test(host) || /^[\d.]+$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new Error('Source URLs must be public HTTPS pages, without credentials, IP addresses or custom ports.');
  }
  url.hash = '';
  return url.href;
}

export function selectSources(topic, supplied = []) {
  if (!Array.isArray(supplied) || supplied.length > 5) throw new Error('Provide between 2 and 5 source URLs.');
  if (!supplied.length) {
    if (/meeting|note.?taker|otter|fireflies|fathom|granola|tl.?dv/i.test(topic)) return MEETING_SOURCES;
    throw new Error('Add 2–5 product or documentation URLs for this topic.');
  }
  const urls = [...new Set(supplied.map(publicSourceUrl))];
  if (urls.length < 2) throw new Error('Provide at least two different source URLs.');
  return urls;
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
    if (code[0] !== '#') return names[code.toLowerCase()] || match;
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
  });
}

export function visibleText(html) {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function boundedText(response) {
  if (!response.body) throw new Error('The page had no readable content.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1500000) { await reader.cancel(); throw new Error('The source page is too large.'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function fetchSource(value, id, fetcher = fetch) {
  let url = publicSourceUrl(value);
  // The deadline covers redirects and the body, not just the response headers.
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: 'text/html,text/plain', 'User-Agent': 'TechFieldTest/0.4 source research' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect did not include a destination.');
      url = publicSourceUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('Source returned HTTP ' + response.status + '.'); }
    const type = response.headers.get('content-type') || '';
    if (!/text\/(html|plain)/i.test(type)) { await response.body?.cancel(); throw new Error('Use an HTML or plain-text source page.'); }
    const html = await boundedText(response);
    const title = visibleText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname).slice(0, 180);
    const text = visibleText(html).slice(0, 8000);
    if (text.length < 150 || /checking your browser|verify you are human|just a moment/i.test(title)) throw new Error('Source content is blocked or too short.');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    return { id, url, requestedUrl: value, title, retrievedAt: new Date().toISOString(), text, sha256: hash };
  }
  throw new Error('Too many redirects.');
}

export async function collectSources(urls, fetcher = fetch) {
  const results = await Promise.allSettled(urls.map((url, index) => fetchSource(url, 'S' + (index + 1), fetcher)));
  const sources = [], failures = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') sources.push(result.value);
    else failures.push({ url: urls[index], reason: String(result.reason.message || result.reason).slice(0, 240) });
  });
  if (sources.length < 2) throw new Error('Fewer than two source pages could be read. Try accessible product or help pages.');
  return { sources, failures };
}
