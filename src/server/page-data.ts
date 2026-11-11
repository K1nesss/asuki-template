// Everything the homepage needs, assembled in one place for the page and for GET /api/now.

import { readContent, type Content } from './db';
import { getSnapshot, type Duolingo, type Github, type Netease, type Social, type Weather } from './live';
import { clock, localMinutes, phaseAt, PHASE_LABEL, type Phase } from '../lib/sky';

export interface PageData {
  content: Content;
  github: Github | null;
  weather: Weather | null;
  /** the app marks in the bio: the account (empty when not set up) and what the hover shows */
  duolingo: { user: string; streak: number | null };
  netease: { id: string; level: number | null };
  /** the profiles on the social cards, fetched; a card without one shows just the account */
  socials: Partial<Record<'x' | 'instagram' | 'youtube' | 'bilibili', Social>>;
  location: string;
  tz: string;
  time: string;
  phase: Phase;
  phaseLabel: string;
  sunrise: string;
  sunset: string;
  ticker: string[];
}




export async function getPageData(env: Env, ctx?: ExecutionContext): Promise<PageData> {
  const none = { data: null };
  const [content, gh, wx, duo, ne] = await Promise.all([
    readContent(env.DB),
    getSnapshot<Github>(env, ctx, 'github'),
    getSnapshot<Weather>(env, ctx, 'weather'),
    // never held up for these: a first copy is fetched in the background
    env.DUOLINGO_USER ? getSnapshot<Duolingo>(env, ctx, 'duolingo', { wait: false }) : none,
    env.NETEASE_ID ? getSnapshot<Netease>(env, ctx, 'netease', { wait: false }) : none,
  ]);
  const [xs, ig, yt, bili] = await Promise.all([
    env.X_USER ? getSnapshot<Social>(env, ctx, 'x', { wait: false }) : none,
    env.BEHOLD_FEED || env.INSTAGRAM_TOKEN ? getSnapshot<Social>(env, ctx, 'instagram', { wait: false }) : none,
    env.YOUTUBE_KEY && env.YOUTUBE_HANDLE ? getSnapshot<Social>(env, ctx, 'youtube', { wait: false }) : none,
    env.BILIBILI_UID ? getSnapshot<Social>(env, ctx, 'bilibili', { wait: false }) : none,
  ]);
  const s = content.status;
  const tz = env.TIMEZONE || 'UTC';
  const location = s.location_label || env.LOCATION_LABEL || '';
  const sunrise = wx.data?.sunrise ?? '06:00';
  const sunset = wx.data?.sunset ?? '18:00';
  const phase = phaseAt(localMinutes(tz), sunrise, sunset);

  const ticker: string[] = [];
  for (const r of content.ticker) ticker.push(String(r.text));

  return {
    content,
    github: gh.data,
    weather: wx.data,
    duolingo: { user: env.DUOLINGO_USER || '', streak: duo.data?.streak ?? null },
    netease: { id: env.NETEASE_ID || '', level: ne.data?.level ?? null },
    socials: {
      ...(xs.data ? { x: xs.data } : {}),
      ...(ig.data ? { instagram: ig.data } : {}),
      ...(yt.data ? { youtube: yt.data } : {}),
      ...(bili.data ? { bilibili: bili.data } : {}),
    },
    location,
    tz,
    time: clock(tz),
    phase,
    phaseLabel: PHASE_LABEL[phase],
    sunrise,
    sunset,
    ticker,
  };
}

