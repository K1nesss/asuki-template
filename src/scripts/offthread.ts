// The page's side of the background thread (canvas-worker.ts) that shades the sea and runs the project
// screens' machines. It starts when the first of them starts moving. Until it says it is running, and for
// good if it can't start (or a browser has no workers), the page does that work itself as it always did.
import type { ToWorker, FromWorker } from './canvas-worker';

let w: Worker | null | undefined;
let up = false;
const onUp = new Set<() => void>(), onDown = new Set<() => void>();
let seaDone: ((sh: Float32Array<ArrayBuffer>, gen: number) => void) | null = null;
const glowDone = new Map<number, (f: Float32Array<ArrayBuffer>) => void>();

function fail() {
  up = false;
  w?.terminate();
  w = null;
  onDown.forEach((f) => f());
}

/** Starts the thread if it isn't yet; true once it is running and taking work. */
export function offthread(): boolean {
  if (w === undefined) {
    try {
      w = new Worker(new URL('./canvas-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      w = null;
    }
    if (w) {
      w.onmessage = ({ data: m }: MessageEvent<FromWorker>) => {
        if (m.k === 'ready') { up = true; onUp.forEach((f) => f()); }
        else if (m.k === 'sea') seaDone?.(m.sh, m.gen);
        else for (const j of m.jobs) glowDone.get(j.id)?.(j.f);
      };
      w.onerror = fail;
      w.onmessageerror = fail;
    }
  }
  return up;
}
export const whenUp = (f: () => void) => onUp.add(f);
/** if the thread dies, its callers go back to doing their own work */
export const whenDown = (f: () => void) => onDown.add(f);

const send = (m: ToWorker, transfer: Transferable[] = []) => w?.postMessage(m, transfer);

// ---- the sea: one frame at a time
export function seaJob(m: Extract<ToWorker, { k: 'sea' }>, done: (sh: Float32Array<ArrayBuffer>, gen: number) => void) {
  seaDone = done;
  send(m, [m.sh.buffer]);
}

// ---- the screens: each frame's jobs go over together
let jobs: Extract<ToWorker, { k: 'glow' }>['jobs'] = [];
const flush = () => {
  const j = jobs;
  jobs = [];
  send({ k: 'glow', jobs: j }, j.map((x) => x.f.buffer));
};
export function glowMake(id: number, kind: number, W: number, H: number, seed: number, past: [number, number, number][], done: (f: Float32Array<ArrayBuffer>) => void) {
  glowDone.set(id, done);
  send({ k: 'mk', id, kind, W, H, seed, past });
}
export function glowJob(id: number, dt: number, t: number, h: number, f: Float32Array<ArrayBuffer>) {
  if (!jobs.length) queueMicrotask(flush);
  jobs.push({ id, dt, t, h, f });
}
