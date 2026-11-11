// Who is calling /admin/*. Cloudflare Access sits in front of it; this checks Access's signed token
// again inside the Worker, so a misconfigured Access rule still can't open the admin API.

import { HttpError } from './http';

interface Jwk extends JsonWebKey { kid: string }
let certs: { at: number; keys: Jwk[] } | null = null;

const teamDomain = (team: string) => (team.includes('.') ? team : `${team}.cloudflareaccess.com`).replace(/^https?:\/\//, '').replace(/\/$/, '');

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function keys(domain: string): Promise<Jwk[]> {
  if (certs && Date.now() - certs.at < 3600_000) return certs.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError('internal', `Access certs: ${res.status}`);
  const j = (await res.json()) as { keys: Jwk[] };
  certs = { at: Date.now(), keys: j.keys };
  return j.keys;
}

/** Returns the caller: an email for a person, "service:<client id>" for a service token. */
export async function whoIsCalling(req: Request, env: Env): Promise<string> {
  const host = new URL(req.url).hostname;
  if (env.ADMIN_DEV_BYPASS === '1' && (host === 'localhost' || host === '127.0.0.1')) return 'dev@localhost';

  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) throw new HttpError('unauthorized', 'Cloudflare Access is not configured for this project');
  const token = req.headers.get('cf-access-jwt-assertion');
  if (!token) throw new HttpError('unauthorized', 'Missing Cloudflare Access token');
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new HttpError('unauthorized', 'Malformed token');

  let header: { kid: string; alg: string };
  let sigBytes: Uint8Array<ArrayBuffer>;
  let payload: { aud: string | string[]; exp: number; nbf?: number; iss: string; email?: string; common_name?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(h)));
    payload = JSON.parse(new TextDecoder().decode(b64url(p)));
    sigBytes = b64url(sig);
  } catch {
    throw new HttpError('unauthorized', 'Malformed token');
  }
  if (header.alg !== 'RS256') throw new HttpError('unauthorized', 'Unexpected token algorithm');

  const domain = teamDomain(env.ACCESS_TEAM);
  const jwk = (await keys(domain)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError('unauthorized', 'Unknown signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new HttpError('unauthorized', 'Bad signature');

  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) throw new HttpError('unauthorized', 'Token is for another application');
  if (payload.exp < now || (payload.nbf && payload.nbf > now + 60)) throw new HttpError('unauthorized', 'Token expired');
  if (payload.iss !== `https://${domain}`) throw new HttpError('unauthorized', 'Token from another team');

  if (payload.email) return payload.email;
  if (payload.common_name) return `service:${payload.common_name}`;
  return 'unknown';
}
