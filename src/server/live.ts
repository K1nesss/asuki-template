// Upstream data (GitHub, weather), kept as snapshots in D1.
// A request never waits on an upstream call when any copy exists: it gets the last good copy,
// and a refresh runs in the background once that copy is older than its TTL.
// The hourly cron keeps both fresh, so visitors almost never trigger a refresh at all.

import persona from '@persona';
import { ensureSchema } from './db';

/** Who is asking, for the services the Worker reads: the site's own address. */
const UA = `${persona.storageKey} (${persona.url.replace(/^https?:\/\//, '').replace(/\/$/, '')})`;

export interface Github {
  user: string;
  total: number;
  commits30d: number;
  /** Last 7 days against the best 7-day run in the past year, 0 to 100. */
  syncRate: number;
  /** 52 weeks, oldest first, 7 days each (Sunday first); level 0 to 4. */
  weeks: { date: string; count: number; level: number }[][];
  /** the profile, for the GitHub hover card (older snapshots lack it) */
  name?: string | null;
  bio?: string | null;
  avatar?: string | null;
}

/** Every year on GitHub, newest first: one count per day from Jan 1 (or the first day GitHub has). */
export interface Years {
  user: string;
  years: { year: number; total: number; start: string; counts: number[]; levels: string }[];
}

export interface Weather {
  tempC: number;
  code: number;
  isDay: boolean;
  /** Local wall-clock times in the site's timezone, "HH:MM". */
  sunrise: string;
  sunset: string;
  /** "lat,lon" the reading is for, so a change of city in wrangler.jsonc never shows the old city's weather */
  place?: string;
}

/** Duolingo, for the streak over the mark in the bio. */
export interface Duolingo {
  user: string;
  /** days in a row */
  streak: number;
}

/** NetEase Cloud Music, for the level over the mark in the bio. */
export interface Netease {
  id: string;
  /** account level, 0 to 10 */
  level: number;
}

/** A social account's public profile, for its card in the contact row. */
export interface Social {
  /** the account this copy was taken for, so a changed setting never shows the old account */
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  bio?: string | null;
  /** Bilibili's account level */
  level?: number | null;
  stats: { label: string; n: number }[];
  /** the newest post or video */
  latest?: { title: string; thumb: string | null; at: string } | null;
}

export interface Snapshot<T> {
  data: T | null;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
}

const TTL = { github: 60 * 60 * 1000, weather: 30 * 60 * 1000, years: 6 * 60 * 60 * 1000, duolingo: 3 * 60 * 60 * 1000, netease: 12 * 60 * 60 * 1000, x: 12 * 60 * 60 * 1000, instagram: 6 * 60 * 60 * 1000, youtube: 6 * 60 * 60 * 1000, bilibili: 6 * 60 * 60 * 1000 };
export type Name = keyof typeof TTL;
export const NAMES = Object.keys(TTL) as Name[];

const inflight = new Map<Name, Promise<unknown>>();

async function read<T>(db: D1Database, name: Name): Promise<Snapshot<T>> {
  await ensureSchema(db);
  const row = await db
    .prepare(`SELECT json, fetched_at, error FROM snapshots WHERE name = ?`)
    .bind(name)
    .first<{ json: string; fetched_at: string; error: string | null }>();
  if (!row) return { data: null, fetchedAt: null, stale: true, error: null };
  const age = Date.now() - Date.parse(row.fetched_at);
  // a failed try with nothing to show yet is tried again after 5 minutes, not after the full TTL; one that
  // failed only because a setting was missing is tried again straight away (the setting may be there now)
  const ttl = row.error && !row.json ? (/ is not set$/.test(row.error) ? 0 : Math.min(TTL[name], 5 * 60 * 1000)) : TTL[name];
  return { data: row.json ? (JSON.parse(row.json) as T) : null, fetchedAt: row.fetched_at, stale: age > ttl, error: row.error };
}

/** Fetches one upstream and stores it. On failure the last good copy stays and the error is recorded. */
export function refresh(env: Env, name: Name): Promise<unknown> {
  const running = inflight.get(name);
  if (running) return running;
  const job = (async () => {
    try {
      const data = await FETCH[name](env);
      await env.DB.prepare(
        `INSERT INTO snapshots (name, json, fetched_at, error) VALUES (?1, ?2, ?3, NULL)
         ON CONFLICT(name) DO UPDATE SET json = ?2, fetched_at = ?3, error = NULL`,
      )
        .bind(name, JSON.stringify(data), new Date().toISOString())
        .run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // keep the old json; only note the error (and stamp the time so we don't retry on every request)
      await env.DB.prepare(
        `INSERT INTO snapshots (name, json, fetched_at, error) VALUES (?1, '', ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET fetched_at = ?2, error = ?3`,
      )
        .bind(name, new Date().toISOString(), msg.slice(0, 300))
        .run();
    } finally {
      inflight.delete(name);
    }
  })();
  inflight.set(name, job);
  return job;
}

const place = (env: Env) => `${env.LAT},${env.LON}`;
/** A copy taken for another city or another account (the setting was changed) counts as no copy at all. */
const elsewhere = (env: Env, name: Name, data: unknown) =>
  !!data &&
  ((name === 'weather' && (data as Weather).place !== place(env)) ||
    (name === 'duolingo' && (data as Duolingo).user !== env.DUOLINGO_USER) ||
    (name === 'netease' && (data as Netease).id !== env.NETEASE_ID) ||
    (name === 'x' && (data as Social).id.toLowerCase() !== env.X_USER.toLowerCase()) ||
    (name === 'youtube' && (data as Social).id !== env.YOUTUBE_HANDLE) ||
    (name === 'bilibili' && (data as Social).id !== env.BILIBILI_UID));

/** `wait: false`: with no copy yet, start fetching one in the background and answer without it. */
export async function getSnapshot<T>(env: Env, ctx: ExecutionContext | undefined, name: Name, { wait = true } = {}): Promise<Snapshot<T>> {
  let snap = await read<T>(env.DB, name);
  if ((!snap.fetchedAt || elsewhere(env, name, snap.data)) && !wait) {
    // with no ExecutionContext (astro dev) it still runs, just unawaited
    const job = refresh(env, name);
    ctx?.waitUntil(job);
    return { ...snap, data: elsewhere(env, name, snap.data) ? null : snap.data };
  }
  if (!snap.fetchedAt || elsewhere(env, name, snap.data)) {
    // first ever request, or a new city: wait for it, but never longer than 2.5 s
    const job = refresh(env, name);
    ctx?.waitUntil(job); // if it takes longer, it still finishes for the next request
    await Promise.race([job, new Promise((r) => setTimeout(r, 2500))]);
    snap = await read<T>(env.DB, name);
    return elsewhere(env, name, snap.data) ? { ...snap, data: null, stale: true } : snap;
  }
  if (snap.stale) {
    const job = refresh(env, name);
    ctx?.waitUntil(job);
  }
  return snap;
}

// ---------------------------------------------------------------- GitHub

const QUERY = `query($login: String!, $since: DateTime!) {
  user(login: $login) {
    name bio avatarUrl(size: 96)
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
    }
    recent: contributionsCollection(from: $since) { totalCommitContributions }
  }
}`;

const LEVEL: Record<string, number> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchGithub(env: Env): Promise<Github> {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${env.GITHUB_TOKEN}`, 'user-agent': UA, 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: env.GITHUB_USER, since } }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  type Day = { date: string; contributionCount: number; contributionLevel: string };
  const body = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      user: {
        name: string | null;
        bio: string | null;
        avatarUrl: string | null;
        contributionsCollection: { contributionCalendar: { totalContributions: number; weeks: { contributionDays: Day[] }[] } };
        recent: { totalCommitContributions: number };
      } | null;
    };
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  const user = body.data?.user;
  if (!user) throw new Error(`GitHub user ${env.GITHUB_USER} not found`);
  const cal = user.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.slice(-52).map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] ?? 0 })),
  );
  return {
    user: env.GITHUB_USER, total: cal.totalContributions, commits30d: user.recent.totalCommitContributions, syncRate: syncRate(weeks.flat()), weeks,
    name: user.name, bio: user.bio, avatar: user.avatarUrl,
  };
}

// Every year: first the list of years the account has contributions in, then all of them in one query
// (one aliased contributionsCollection per year). Past years never change; the 6-hour refresh is for this one.
async function gql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${env.GITHUB_TOKEN}`, 'user-agent': UA, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const body = (await res.json()) as { errors?: { message: string }[]; data?: T };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error('GitHub sent no data');
  return body.data;
}

async function fetchYears(env: Env): Promise<Years> {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  const list = await gql<{ user: { contributionsCollection: { contributionYears: number[] } } | null }>(
    env, `query($login: String!) { user(login: $login) { contributionsCollection { contributionYears } } }`, { login: env.GITHUB_USER },
  );
  if (!list.user) throw new Error(`GitHub user ${env.GITHUB_USER} not found`);
  const ys = [...list.user.contributionsCollection.contributionYears].sort((a, b) => b - a).slice(0, 20);
  if (!ys.length) return { user: env.GITHUB_USER, years: [] };
  const parts = ys.map((y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } }`);
  type Cal = { contributionCalendar: { totalContributions: number; weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[] } };
  const all = await gql<{ user: Record<string, Cal> | null }>(env, `query($login: String!) { user(login: $login) { ${parts.join(' ')} } }`, { login: env.GITHUB_USER });
  if (!all.user) throw new Error(`GitHub user ${env.GITHUB_USER} not found`);
  return {
    user: env.GITHUB_USER,
    years: ys.map((y) => {
      const cal = all.user![`y${y}`].contributionCalendar;
      const days = cal.weeks.flatMap((w) => w.contributionDays).filter((d) => d.date.startsWith(`${y}-`)).sort((a, b) => a.date.localeCompare(b.date));
      return {
        year: y,
        total: cal.totalContributions,
        start: days[0]?.date ?? `${y}-01-01`,
        counts: days.map((d) => d.contributionCount),
        levels: days.map((d) => LEVEL[d.contributionLevel] ?? 0).join(''),
      };
    }),
  };
}

/** The last 7 days against the best 7-day run of the year. */
export function syncRate(days: { count: number }[]): number {
  if (days.length < 7) return 0;
  let run = 0;
  let best = 0;
  days.forEach((d, i) => {
    run += d.count;
    if (i >= 7) run -= days[i - 7].count;
    if (i >= 6) best = Math.max(best, run);
  });
  if (!best) return 0;
  return Math.round((run / best) * 1000) / 10;
}

// ---------------------------------------------------------------- weather

async function fetchWeather(env: Env): Promise<Weather> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: env.LAT,
    longitude: env.LON,
    current: 'temperature_2m,weather_code,is_day',
    daily: 'sunrise,sunset',
    timezone: env.TIMEZONE,
    forecast_days: '1',
  }).toString();
  const res = await fetch(u, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number };
    daily: { sunrise: string[]; sunset: string[] };
  };
  return {
    tempC: Math.round(j.current.temperature_2m),
    code: j.current.weather_code,
    isDay: j.current.is_day === 1,
    sunrise: j.daily.sunrise[0].slice(11, 16),
    sunset: j.daily.sunset[0].slice(11, 16),
    place: place(env),
  };
}

// ---------------------------------------------------------------- Duolingo
// No official API: the public users endpoint answers without a key. If it stops answering, the last good
// copy stays (or the mark is shown without its streak).
async function fetchDuolingo(env: Env): Promise<Duolingo> {
  const user = env.DUOLINGO_USER;
  if (!user) throw new Error('DUOLINGO_USER is not set');
  const fields = 'users{username,streak}';
  const res = await fetch(`https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(user)}&fields=${encodeURIComponent(fields)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Duolingo ${res.status}`);
  const j = (await res.json()) as { users?: { streak?: unknown }[] };
  const streak = j.users?.[0]?.streak;
  if (typeof streak !== 'number' || !Number.isInteger(streak) || streak < 0) throw new Error(`Duolingo sent no streak for ${user}`);
  return { user, streak };
}

// ---------------------------------------------------------------- NetEase Cloud Music
// No official API either. The public user detail answers without signing in, with the account level
// (listening time is only shown to the signed-in owner, so it can't be read from here).
async function fetchNetease(env: Env): Promise<Netease> {
  const id = env.NETEASE_ID;
  if (!id) throw new Error('NETEASE_ID is not set');
  const res = await fetch(`https://music.163.com/api/v1/user/detail/${encodeURIComponent(id)}`, {
    // a plain request, like curl's: no referer, no accept header
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NetEase ${res.status}`);
  const j = (await res.json()) as { code?: number; level?: unknown };
  if (j.code !== 200 || typeof j.level !== 'number' || !Number.isInteger(j.level) || j.level < 0) throw new Error(`NetEase sent no level for ${id} (code ${j.code ?? 'none'})`);
  return { id, level: j.level };
}

// ---------------------------------------------------------------- Instagram
// The official API (Instagram API with Instagram Login), which reads your own Creator or Business account.
// INSTAGRAM_TOKEN is the 60-day token from the Meta app dashboard. Every week the Worker trades it for a new
// one and keeps that in D1 (table meta, never sent to the page), so it never runs out. When you put a new
// INSTAGRAM_TOKEN in the secrets, the stored one is dropped and the new one used.
const WEEK = 7 * 24 * 60 * 60 * 1000;
async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function instagramToken(env: Env): Promise<string> {
  const seed = env.INSTAGRAM_TOKEN;
  if (!seed) throw new Error('INSTAGRAM_TOKEN is not set');
  const tag = await sha(seed);
  const row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'instagram_token'`).first<{ v: string }>();
  let token = seed, at = 0;
  if (row) {
    try {
      const j = JSON.parse(row.v) as { seed: string; token: string; at: string };
      if (j.seed === tag) { token = j.token; at = Date.parse(j.at); }
    } catch { /* a broken row is replaced below */ }
  }
  if (Date.now() - at > WEEK) {
    // a token can only be renewed once it is a day old; until then this fails quietly and is tried next time
    try {
      const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
      const j = res.ok ? ((await res.json()) as { access_token?: string }) : {};
      if (j.access_token) {
        token = j.access_token;
        await env.DB.prepare(`INSERT INTO meta (k, v) VALUES ('instagram_token', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1`)
          .bind(JSON.stringify({ seed: tag, token, at: new Date().toISOString() }))
          .run();
      }
    } catch { /* keep the current token */ }
  }
  return token;
}
/** Instagram's own error message, never the request URL (which holds the token). */
async function igGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://graph.instagram.com/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || j.error) throw new Error(`Instagram ${res.status}: ${String(j.error?.message ?? '').slice(0, 160)}`);
  return j;
}
// The easy way, without a Meta app: Behold (behold.so) connects your Instagram once in its dashboard and
// publishes it as a JSON feed (feeds.behold.so/<id>); its free plan is plenty for one fetch every 6 hours.
// The feed id is public (anyone can read the feed), so it's a plain setting, not a secret.
async function fetchBehold(id: string): Promise<Social> {
  const res = await fetch(`https://feeds.behold.so/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Behold ${res.status}`);
  type Size = { mediaUrl?: string };
  const j = (await res.json()) as {
    username?: string; biography?: string; profilePictureUrl?: string; followersCount?: number; followsCount?: number;
    posts?: { mediaType?: string; mediaUrl?: string; thumbnailUrl?: string; sizes?: { small?: Size; medium?: Size }; caption?: string; prunedCaption?: string; timestamp?: string }[];
  };
  if (!j.username) throw new Error('Behold sent no profile');
  const stats: Social['stats'] = [];
  if (typeof j.followsCount === 'number') stats.push({ label: 'Following', n: j.followsCount });
  if (typeof j.followersCount === 'number') stats.push({ label: 'Followers', n: j.followersCount });
  const m = j.posts?.[0];
  return {
    id: j.username,
    name: j.username,
    handle: `@${j.username}`,
    avatar: j.profilePictureUrl ?? null,
    bio: j.biography?.trim() || null,
    stats,
    latest: m?.timestamp
      ? {
          title: (m.prunedCaption ?? m.caption ?? '').split('\n')[0].slice(0, 120) || 'Latest post',
          // Behold's own copies don't expire like Instagram's links do
          thumb: m.sizes?.medium?.mediaUrl ?? m.sizes?.small?.mediaUrl ?? (m.mediaType === 'VIDEO' ? m.thumbnailUrl : m.mediaUrl) ?? null,
          at: m.timestamp,
        }
      : null,
  };
}
async function fetchInstagram(env: Env): Promise<Social> {
  if (env.BEHOLD_FEED) return fetchBehold(env.BEHOLD_FEED);
  const token = await instagramToken(env);
  const me = await igGet<{ username?: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number }>(
    'me?fields=username,name,profile_picture_url,followers_count,media_count',
    token,
  );
  if (!me.username) throw new Error('Instagram sent no profile');
  const media = await igGet<{ data?: { caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; timestamp?: string }[] }>(
    'me/media?fields=caption,media_type,media_url,thumbnail_url,timestamp&limit=1',
    token,
  ).catch(() => ({ data: [] }));
  const m = media.data?.[0];
  return {
    id: me.username,
    name: me.name || me.username,
    handle: `@${me.username}`,
    avatar: me.profile_picture_url ?? null,
    stats: [
      { label: 'Followers', n: me.followers_count ?? 0 },
      { label: 'Posts', n: me.media_count ?? 0 },
    ],
    latest: m && m.timestamp
      ? { title: (m.caption ?? '').split('\n')[0].slice(0, 120) || 'Latest post', thumb: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? null, at: m.timestamp }
      : null,
  };
}

// ---------------------------------------------------------------- X
// X has no free way to read a profile, so this asks FxTwitter (api.fxtwitter.com), the open-source service
// behind fxtwitter.com link previews, which offers a public JSON API for exactly this. It's a third party:
// if it stops answering, the last good copy stays.
async function fetchX(env: Env): Promise<Social> {
  const user = env.X_USER;
  if (!user) throw new Error('X_USER is not set');
  const res = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(user)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`FxTwitter ${res.status}`);
  type U = { screen_name?: string; name?: string; description?: string; avatar_url?: string; followers?: number; following?: number; tweets?: number };
  const j = (await res.json()) as { code?: number; user?: U };
  const u = j.user;
  if (!u?.screen_name) throw new Error(`FxTwitter sent no profile for ${user} (code ${j.code ?? 'none'})`);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const stats: Social['stats'] = [];
  if (n(u.following) != null) stats.push({ label: 'Following', n: n(u.following)! });
  if (n(u.followers) != null) stats.push({ label: 'Followers', n: n(u.followers)! });
  return {
    id: u.screen_name,
    name: u.name || u.screen_name,
    handle: `@${u.screen_name}`,
    // X's own small size is 48 px; ask for the 200 px picture instead
    avatar: u.avatar_url ? u.avatar_url.replace(/_normal(\.\w+)$/, '_200x200$1') : null,
    bio: u.description?.trim() || null,
    stats,
  };
}

// ---------------------------------------------------------------- YouTube
// The YouTube Data API with a key (free; each refresh costs 2 of the 10,000 units a day).
async function fetchYoutube(env: Env): Promise<Social> {
  const handle = env.YOUTUBE_HANDLE, key = env.YOUTUBE_KEY;
  if (!handle) throw new Error('YOUTUBE_HANDLE is not set');
  if (!key) throw new Error('YOUTUBE_KEY is not set');
  const api = async <T>(path: string): Promise<T> => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || j.error) throw new Error(`YouTube ${res.status}: ${String(j.error?.message ?? '').slice(0, 160)}`);
    return j;
  };
  type Thumbs = Record<string, { url?: string }>;
  const ch = await api<{ items?: { snippet?: { title?: string; customUrl?: string; thumbnails?: Thumbs }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
    `channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent('@' + handle.replace(/^@/, ''))}`,
  );
  const c = ch.items?.[0];
  if (!c?.snippet) throw new Error(`YouTube has no channel @${handle}`);
  const stats: Social['stats'] = [];
  if (!c.statistics?.hiddenSubscriberCount) stats.push({ label: 'Subscribers', n: Number(c.statistics?.subscriberCount ?? 0) });
  stats.push({ label: 'Videos', n: Number(c.statistics?.videoCount ?? 0) });
  let latest: Social['latest'] = null;
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (uploads && Number(c.statistics?.videoCount ?? 0) > 0) {
    const pl = await api<{ items?: { snippet?: { title?: string; publishedAt?: string; thumbnails?: Thumbs } }[] }>(`playlistItems?part=snippet&maxResults=1&playlistId=${encodeURIComponent(uploads)}`).catch(() => ({ items: [] }));
    const v = pl.items?.[0]?.snippet;
    if (v?.title && v.publishedAt) latest = { title: v.title, thumb: v.thumbnails?.medium?.url ?? v.thumbnails?.default?.url ?? null, at: v.publishedAt };
  }
  const th = c.snippet.thumbnails ?? {};
  return {
    id: handle,
    name: c.snippet.title ?? handle,
    handle: c.snippet.customUrl || `@${handle}`,
    avatar: th.medium?.url ?? th.default?.url ?? null,
    stats,
    latest,
  };
}

// ---------------------------------------------------------------- Bilibili
// The public profile card, which answers without signing in. Bilibili sometimes turns away requests from
// servers; then the last good copy stays (or the card shows the account without its profile).
async function fetchBilibili(env: Env): Promise<Social> {
  const uid = env.BILIBILI_UID;
  if (!uid) throw new Error('BILIBILI_UID is not set');
  const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(uid)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bilibili ${res.status}`);
  const j = (await res.json()) as { code?: number; data?: { card?: { name?: string; face?: string; sign?: string; fans?: number; level_info?: { current_level?: number } }; follower?: number; archive_count?: number } };
  const c = j.data?.card;
  if (j.code !== 0 || !c?.name) throw new Error(`Bilibili sent no profile for ${uid} (code ${j.code ?? 'none'})`);
  return {
    id: uid,
    name: c.name,
    handle: `UID ${uid}`,
    avatar: c.face ? c.face.replace(/^http:/, 'https:') : null,
    bio: c.sign?.trim() || null,
    level: c.level_info?.current_level ?? null,
    stats: [
      { label: 'Followers', n: j.data?.follower ?? c.fans ?? 0 },
      { label: 'Videos', n: j.data?.archive_count ?? 0 },
    ],
    latest: null,
  };
}

const FETCH: Record<Name, (env: Env) => Promise<unknown>> = {
  github: fetchGithub,
  weather: fetchWeather,
  years: fetchYears,
  duolingo: fetchDuolingo,
  netease: fetchNetease,
  x: fetchX,
  instagram: fetchInstagram,
  youtube: fetchYoutube,
  bilibili: fetchBilibili,
};
