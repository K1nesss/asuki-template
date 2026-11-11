export type ErrorCode = 'bad_request' | 'unauthorized' | 'not_found' | 'conflict' | 'rate_limited' | 'internal';

const STATUS: Record<ErrorCode, number> = { bad_request: 400, unauthorized: 401, not_found: 404, conflict: 409, rate_limited: 429, internal: 500 };

export function json(body: unknown, init: ResponseInit & { cache?: number } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', init.cache ? `public, max-age=${init.cache}` : 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** The one error shape every project's API uses. */
export function fail(code: ErrorCode, message: string, headers?: HeadersInit): Response {
  return json({ error: { code, message } }, { status: STATUS[code], headers });
}

export class HttpError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

/** A daily, salted hash of the visitor: enough to count each visitor once a day, useless for tracking. */
export async function visitorHash(req: Request, salt: string, day: string): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const ua = req.headers.get('user-agent') ?? '';
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The colo's default cache. (The DOM lib in this tsconfig hides the Workers-only `caches.default`.) */
export const edgeCache = () => (caches as unknown as { default: Cache }).default;
