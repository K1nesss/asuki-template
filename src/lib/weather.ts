// The weather in the banner sky, shared by the server (first paint) and the browser (every 10 minutes).
// Open-Meteo reports WMO weather codes; the sky only needs to know which of eight looks to wear.

export type Sky = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'storm' | 'snow';

export const SKIES: readonly Sky[] = ['clear', 'partly', 'overcast', 'fog', 'drizzle', 'rain', 'storm', 'snow'];

export const SKY_LABEL: Record<Sky, string> = {
  clear: 'Clear', partly: 'Partly cloudy', overcast: 'Overcast', fog: 'Fog',
  drizzle: 'Drizzle', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow',
};

export function skyOf(code: number | null | undefined): Sky {
  if (code == null || code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain'; // 61–67, 80–82
}
