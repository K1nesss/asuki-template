// The background thread behind the sea and the project screens. It does only their arithmetic: the sea's
// shade for every gutter cell, and each screen's machine. The page keeps the canvases and does the cheap
// last step itself (inks, dither, colours, and the theme circle, which must follow the browser's own circle
// frame for frame), so everything looks exactly as it did when the page did all of it.
// The work arrives in buffers the page hands over and comes back in the same buffers, so nothing is copied.
import { shadeGutters } from './sea';
import { machine, type Machine } from './machines';

export type ToWorker =
  | { k: 'sea'; gen: number; t: number; W: number; H: number; GW: number; cw: number; ch: number; sh: Float32Array<ArrayBuffer> }
  | { k: 'mk'; id: number; kind: number; W: number; H: number; seed: number; past: [number, number, number][] }
  | { k: 'glow'; jobs: { id: number; dt: number; t: number; h: number; f: Float32Array<ArrayBuffer> }[] };
export type FromWorker =
  | { k: 'ready' }
  | { k: 'sea'; gen: number; sh: Float32Array<ArrayBuffer> }
  | { k: 'glow'; jobs: { id: number; f: Float32Array<ArrayBuffer> }[] };

const scope = self as unknown as { postMessage(m: FromWorker, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const machines = new Map<number, Machine>();
const calm = new Float32Array(1024); // the page works these out itself

scope.onmessage = ({ data: m }) => {
  if (m.k === 'sea') {
    shadeGutters(m.sh, calm, m.W, m.H, m.GW, m.cw, m.ch, m.t);
    scope.postMessage({ k: 'sea', gen: m.gen, sh: m.sh }, [m.sh.buffer]);
  } else if (m.k === 'mk') {
    // a screen that ran on the page until now: replay its steps so the machine is exactly where the page's was
    const mc = machine(m.kind, m.W, m.H, m.seed), f = new Float32Array(m.W * m.H);
    for (const [dt, t, h] of m.past) mc(f, dt, t, h);
    machines.set(m.id, mc);
  } else {
    for (const j of m.jobs) machines.get(j.id)?.(j.f, j.dt, j.t, j.h);
    scope.postMessage({ k: 'glow', jobs: m.jobs.map(({ id, f }) => ({ id, f })) }, m.jobs.map((j) => j.f.buffer));
  }
};
scope.postMessage({ k: 'ready' }, []);
