// Time of day where the site's owner lives, shared by the server (first paint) and the browser (every minute after).

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';

export const PHASE_LABEL: Record<Phase, string> = { night: 'Night', dawn: 'Dawn', day: 'Day', dusk: 'Dusk' };

/** Minutes since local midnight in a timezone. */
export function localMinutes(tz: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export function clock(tz: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Dawn runs 45 min either side of sunrise; dusk from an hour before sunset to 40 min after. */
export function phaseAt(minutes: number, sunrise = '06:00', sunset = '18:00'): Phase {
  const up = mins(sunrise), down = mins(sunset);
  if (minutes >= up - 45 && minutes < up + 45) return 'dawn';
  if (minutes >= up + 45 && minutes < down - 60) return 'day';
  if (minutes >= down - 60 && minutes < down + 40) return 'dusk';
  return 'night';
}
