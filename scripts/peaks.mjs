// npm run peaks -- <persona>/public/music/<file>.mp3
// Prints the track fields for persona/<name>/index.ts: the duration and the 256 loudness digits the
// waveform seek bar draws (the RMS of each slice against the loudest, on a curve). Needs ffmpeg.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: npm run peaks -- persona/<name>/public/music/<file>.mp3'); process.exit(1); }
const RATE = 8000;
const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
if (r.error || r.status !== 0) {
  console.error(r.error?.code === 'ENOENT' ? 'ffmpeg is not installed (https://ffmpeg.org/download.html).' : String(r.stderr));
  process.exit(1);
}
const n = Math.floor(r.stdout.length / 2);
const pcm = new Int16Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 2)); // copied, so it is aligned
const N = 256, per = Math.max(1, Math.floor(pcm.length / N));
const rms = Array.from({ length: N }, (_, i) => {
  let s = 0;
  for (let j = i * per; j < Math.min(pcm.length, (i + 1) * per); j++) s += (pcm[j] / 32768) ** 2;
  return Math.sqrt(s / per);
});
const max = Math.max(...rms) || 1;
const peaks = rms.map((v) => Math.min(9, Math.round((v / max) ** 1.8 * 9))).join('');
const duration = Math.round((pcm.length / RATE) * 100) / 100;
console.log(`  track: {
    src: '/media/${basename(file)}',
    title: 'Title',
    artist: 'Artist',
    duration: ${duration},
    peaks: '${peaks}',
  },`);
