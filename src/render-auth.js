const ISSUER = 'https://token.actions.githubusercontent.com';
let keys, expires = 0;
function bytes(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export async function verifyRenderer(request, env, fetcher = fetch) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token || token.length > 15000) throw { code: 401, message: 'Renderer identity required.' };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    const repo = env.RENDER_REPOSITORY;
    if (!repo || !env.RENDER_REPOSITORY_ID || !env.RENDER_OWNER_ID) throw new Error();
    if (header.alg !== 'RS256' || claims.iss !== ISSUER || claims.aud !== 'techfieldtest-render' ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 30 ||
      !Number.isFinite(claims.iat) || claims.iat > now + 30 || now - claims.iat > 600 ||
      claims.repository !== repo || String(claims.repository_id) !== env.RENDER_REPOSITORY_ID ||
      String(claims.repository_owner_id) !== env.RENDER_OWNER_ID || claims.ref !== 'refs/heads/main' ||
      claims.workflow_ref !== repo + '/.github/workflows/daily-production.yml@refs/heads/main' ||
      !['schedule','workflow_dispatch','push'].includes(claims.event_name)) throw new Error();
    // Fixed issuer/key endpoint only. Never follow a token-supplied jku or URL.
    if (!keys || expires < Date.now() || !keys.some(k => k.kid === header.kid)) {
      const response = await fetcher(ISSUER + '/.well-known/jwks', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const body = await response.json(); keys = body.keys; expires = Date.now() + 3600000;
    }
    const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw new Error();
    return claims;
  } catch { throw { code: 403, message: 'Renderer identity was not authorized.' }; }
}

export function requireOwner(request, env) {
  if (!env.OWNER_TOKEN) throw { code: 409, message: 'Final approval needs the OWNER_TOKEN secret configured in Cloudflare.' };
  if (request.headers.get('authorization') !== 'Bearer ' + env.OWNER_TOKEN) throw { code: 401, message: 'Owner approval key required.' };
}
