// The site's sound, synthesised except where the persona's `sfx` names a recording.
// The palette is a mecha control room and a lot of steel: relay clicks, console beeps, servo whine,
// filtered air, and struck metal (several inharmonic partials, each with its own decay, over a noise
// transient), all through a short dark room. Struck metal is re-drawn on every hit, so no two clangs
// and no two shield strikes sound quite alike. Silent while <html data-sound> is not "on".

import persona from '@persona';

const SFX = persona.sfx;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let room: ConvolverNode | null = null;
let noise: AudioBuffer | null = null;
const files = new Map<string, Promise<AudioBuffer | null>>();

export type Cue =
  // interface
  | 'boot' | 'tick' | 'beep' | 'panel' | 'tink' | 'data' | 'relay' | 'switch' | 'latch' | 'confirm' | 'flip'
  // the full pages
  | 'open' | 'close' | 'clack' | 'play' | 'stop' | 'roll' | 'eject' | 'needle'
  // the banner
  | 'field' | 'unplug' | 'plug' | 'wake'
  // an Easter egg's card
  | 'emerge' | 'seat'
  // the pet and the prop
  | 'pet' | 'angry' | 'alert' | 'whoosh' | 'clang' | 'ricochet' | 'knock' | 'grab' | 'pull';

const HOVERS = new Set<Cue>(['tick', 'beep', 'panel', 'tink', 'data', 'clack', 'roll']);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function setup() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (!out) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp).connect(ctx.destination);
    // a small hard room: a noise tail that dies fast and loses its highs (drawn ahead, see roomTail)
    const tail = roomTail(ctx.sampleRate);
    const ir = ctx.createBuffer(2, tail.l.length, ctx.sampleRate);
    ir.copyToChannel(tail.l, 0);
    ir.copyToChannel(tail.r, 1);
    room = ctx.createConvolver();
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    room.connect(wet).connect(out);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    tails.clear();
  }
  return ctx;
}

// The room's tail is about 170,000 random samples. Drawn on the first click, it held that click up for ~50 ms,
// so it is drawn ahead instead, a slice at a time in idle moments after the page has loaded. The sample rate is
// only known once audio starts, so both usual rates are drawn; any other rate (or a click before the slices are
// done) finishes the drawing on the spot, as before. Same noise, same shape: only the moment it is made moves.
const ROOM_S = 1.8;
type Tail = { l: Float32Array<ArrayBuffer>; r: Float32Array<ArrayBuffer>; steps: Generator<void, void, void>; done: boolean };
const tails = new Map<number, Tail>();
function tailFor(rate: number): Tail {
  let t = tails.get(rate);
  if (!t) {
    const len = Math.floor(rate * ROOM_S);
    const l = new Float32Array(len), r = new Float32Array(len);
    t = { l, r, done: false, steps: (function* () {
      for (const d of [l, r]) {
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len;
          lp += ((Math.random() * 2 - 1) - lp) * (0.9 - 0.75 * k);
          d[i] = lp * Math.pow(1 - k, 3);
          if ((i & 8191) === 8191) yield;
        }
      }
    })() };
    tails.set(rate, t);
  }
  return t;
}
function roomTail(rate: number) {
  const t = tailFor(rate);
  while (!t.done) t.done = !!t.steps.next().done;
  return t;
}
if (typeof window !== 'undefined') {
  const idle = (fn: (d?: IdleDeadline) => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50);
  const pending = () => [48000, 44100].map(tailFor).filter((t) => !t.done);
  const step = (d?: IdleDeadline) => {
    if (out) return; // audio already started: nothing left to prepare
    const todo = pending();
    if (!todo.length) return;
    const t = todo[0];
    do { t.done = !!t.steps.next().done; } while (!t.done && d && !d.didTimeout && d.timeRemaining() > 3);
    idle(step);
  };
  const start = () => idle(step);
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

/** Browsers keep audio locked until the first click or key; unlock it then, so hovers sound afterwards. */
export function unlockAudio() {
  if (document.documentElement.dataset.sound !== 'on') return;
  try {
    const c = setup();
    for (const url of Object.values(SFX)) if (url) void load(c, url); // fetch recordings now, not on first use
  } catch {}
}

type Dest = AudioNode;

/** an oscillator: pitch sweep, attack, exponential decay */
function tone(c: AudioContext, dest: Dest, type: OscillatorType, f0: number, f1: number, t: number, dur: number, gain: number, attack = 0.003) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** noise through a filter whose centre sweeps from f0 to f1 */
function air(c: AudioContext, dest: Dest, kind: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number, gain: number, attack = 0.005) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise;
  s.loop = true;
  f.type = kind;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

/** a heavy servo/whine: a buzzy saw through a lowpass that opens and closes */
function servo(c: AudioContext, dest: Dest, f0: number, f1: number, t: number, dur: number, gain: number) {
  const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(f0 * 2, t);
  f.frequency.exponentialRampToValueAtTime(f1 * 5, t + dur * 0.6);
  f.frequency.exponentialRampToValueAtTime(f1 * 1.5, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/**
 * Struck steel: partials at inharmonic ratios (a bar or plate), each decaying at its own rate, the high
 * ones faster; a click of noise for the strike; a little pitch drop as the metal relaxes.
 * The ratios and decays are jittered on every call.
 */
function metal(c: AudioContext, dry: Dest, wet: Dest, t: number, o: { f: number; ring: number; gain: number; ratios?: number[]; bright?: number }) {
  const ratios = o.ratios ?? [1, 2.76, 5.4, 8.93, 13.3];
  ratios.forEach((r0, i) => {
    const r = r0 * rnd(0.97, 1.03), f = o.f * r;
    if (f > 15000) return;
    const dur = (o.ring * rnd(0.8, 1.2)) / (1 + i * 0.55);
    const g = (o.gain * (i === 0 ? 0.8 : 1)) / (1 + i * (1.2 - (o.bright ?? 0.5)));
    tone(c, i < 2 ? dry : wet, 'sine', f, f * rnd(0.985, 0.995), t, dur, g, 0.0015);
    tone(c, wet, 'sine', f * 1.0035, f * 0.99, t, dur * 0.8, g * 0.5, 0.0015); // a slow beat against it
  });
  air(c, dry, 'highpass', 2500, 2500, 0.7, t, 0.025, o.gain * 1.6, 0.0008); // the strike
}

type Builder = (c: AudioContext, dry: Dest, wet: Dest, t: number, amount: number) => void;

const CUES: Record<Cue, Builder> = {
  // ---- interface
  boot(c, dry, wet, t) { // a console coming up: two clipped beeps and a rising hum
    tone(c, dry, 'square', 1046, 1046, t, 0.05, 0.03, 0.001);
    tone(c, dry, 'square', 1568, 1568, t + 0.07, 0.07, 0.03, 0.001);
    servo(c, wet, 60, 140, t, 0.45, 0.05);
  },
  tick(c, dry, _w, t) { // a relay contact under the pointer
    air(c, dry, 'bandpass', rnd(3600, 4400), 3000, 6, t, 0.018, 0.09, 0.0005);
    tone(c, dry, 'sine', 180, 120, t, 0.03, 0.03, 0.001);
  },
  beep(c, dry, wet, t) { // a short console beep, a hard sine
    const f = [1760, 1975, 2093][Math.floor(Math.random() * 3)];
    tone(c, dry, 'sine', f, f, t, 0.045, 0.035, 0.001);
    tone(c, wet, 'square', f / 2, f / 2, t, 0.03, 0.006, 0.001);
  },
  panel(c, dry, wet, t) { // a project card under the pointer: a soft magnetic seat, low and short
    tone(c, dry, 'sine', 95, 62, t, 0.07, 0.07, 0.002);
    air(c, dry, 'lowpass', 1800, 700, 0.7, t, 0.035, 0.035, 0.001);
    tone(c, wet, 'triangle', 392, 392, t + 0.012, 0.06, 0.006, 0.004);
  },
  tink(c, dry, wet, t, amount) { // the loadout chips: small steel bars, pitched along the row
    metal(c, dry, wet, t, { f: 900 * Math.pow(2, amount / 12), ring: 0.35, gain: 0.03, bright: 0.7 });
  },
  data(c, dry, _w, t, amount) { // a heatmap cell: a data blip, higher for busier days
    const f = 520 * Math.pow(2, (amount * 7) / 12);
    tone(c, dry, 'square', f, f, t, 0.025, 0.012, 0.001);
  },
  relay(c, dry, wet, t) { // a heavy relay: a clack and a thump
    air(c, dry, 'bandpass', 2600, 1800, 3, t, 0.03, 0.16, 0.0005);
    tone(c, dry, 'sine', 140, 60, t, 0.09, 0.12, 0.001);
    metal(c, dry, wet, t, { f: 1400, ring: 0.08, gain: 0.012 });
  },
  switch(c, dry, wet, t) { // a toggle throwing over: two-stage click and a short whine
    air(c, dry, 'bandpass', 3000, 2400, 4, t, 0.02, 0.12, 0.0005);
    air(c, dry, 'bandpass', 2200, 1800, 4, t + 0.055, 0.025, 0.1, 0.0005);
    servo(c, wet, 220, 330, t + 0.02, 0.14, 0.02);
  },
  latch(c, dry, wet, t) { // a hatch latch on links
    tone(c, dry, 'sine', 220, 90, t, 0.1, 0.1, 0.001);
    metal(c, dry, wet, t, { f: 1150, ring: 0.18, gain: 0.02, bright: 0.3 });
  },
  confirm(c, dry, wet, t) { // sending a message: the control room's acknowledge, three rising beeps
    [1318, 1568, 2093].forEach((f, i) => tone(c, i === 2 ? wet : dry, 'square', f, f, t + i * 0.075, 0.06, 0.022, 0.001));
  },
  flip(c, dry, wet, t) { // the avatar card turning: a sweep of air, a latch at the end
    air(c, dry, 'bandpass', 400, 2400, 1.2, t, 0.32, 0.08, 0.1);
    air(c, wet, 'bandpass', 2400, 900, 1.2, t + 0.18, 0.2, 0.03, 0.03);
    tone(c, dry, 'sine', 160, 80, t + 0.3, 0.08, 0.06, 0.001);
    metal(c, dry, wet, t + 0.3, { f: 1300, ring: 0.12, gain: 0.012 });
  },

  // ---- the full pages
  open(c, dry, wet, t) { // a page coming out of its panel: a servo winding up under rising air, then it seats
    servo(c, wet, 70, 190, t, 0.38, 0.05);
    air(c, dry, 'bandpass', 600, 2600, 1.4, t, 0.3, 0.05, 0.12);
    tone(c, dry, 'sine', 150, 70, t + 0.36, 0.1, 0.12, 0.001);
    metal(c, dry, wet, t + 0.36, { f: 1250, ring: 0.2, gain: 0.02 });
  },
  close(c, dry, wet, t) { // and going back in: winding down, falling air, a relay as it lands
    servo(c, wet, 190, 60, t, 0.32, 0.045);
    air(c, dry, 'bandpass', 2400, 500, 1.4, t, 0.26, 0.04, 0.06);
    air(c, dry, 'bandpass', 2600, 1800, 3, t + 0.28, 0.03, 0.14, 0.0005);
    tone(c, dry, 'sine', 140, 60, t + 0.28, 0.09, 0.12, 0.001);
  },
  clack(c, dry, _w, t, amount) { // a case sliding past on the shelf: hard plastic, never twice the same
    air(c, dry, 'bandpass', 1700 + amount * 500, 1100, 3, t, 0.03, 0.14, 0.0005);
    tone(c, dry, 'sine', 210 + amount * 40, 90, t, 0.06, 0.08, 0.001);
  },
  play(c, dry, wet, t) { // a case swinging round to face you: air past its edge, a soft heavy seat as it
    // locks in, the catch clicking, and a low drive coming up behind it
    air(c, dry, 'bandpass', 500, 1600, 1.1, t, 0.26, 0.045, 0.1);
    tone(c, dry, 'sine', 120, 58, t + 0.22, 0.14, 0.13, 0.002);
    air(c, dry, 'lowpass', 1400, 500, 0.8, t + 0.22, 0.05, 0.05, 0.001);
    air(c, dry, 'bandpass', 2900, 2500, 5, t + 0.235, 0.015, 0.07, 0.0005);
    servo(c, wet, 46, 74, t + 0.24, 0.55, 0.022);
  },
  stop(c, dry, wet, t) { // and letting go: the catch, a lighter seat, the drive winding down
    air(c, dry, 'bandpass', 2600, 2300, 5, t, 0.014, 0.06, 0.0005);
    air(c, dry, 'bandpass', 1500, 500, 1.1, t + 0.01, 0.18, 0.03, 0.05);
    tone(c, dry, 'sine', 100, 55, t + 0.14, 0.1, 0.08, 0.002);
    servo(c, wet, 74, 44, t, 0.35, 0.016);
  },
  eject(c, dry, _w, t) { // a record sliding out of its sleeve: vinyl against paper, then a light tick as it clears the edge
    air(c, dry, 'bandpass', 1600, 4200, 1.3, t, 0.2, 0.045, 0.06);
    air(c, dry, 'bandpass', 3300, 3000, 6, t + 0.18, 0.012, 0.05, 0.0005);
    tone(c, dry, 'sine', 260, 150, t + 0.18, 0.05, 0.035, 0.001);
  },
  needle(c, dry, wet, t) { // the record dropping onto the platter and the stylus touching down: a soft thump, surface crackle, the motor
    tone(c, dry, 'sine', 95, 58, t, 0.11, 0.08, 0.002);
    air(c, dry, 'highpass', 4500, 4500, 0.7, t + 0.06, 0.3, 0.014, 0.002);
    for (let k = 0; k < 5; k++) air(c, dry, 'bandpass', rnd(2500, 6000), 3000, 4, t + 0.08 + rnd(0, 0.28), 0.006, rnd(0.02, 0.05), 0.0005);
    servo(c, wet, 28, 52, t, 0.7, 0.012);
  },
  roll(c, dry, _w, t) { // a number wheel turning over (the year on Milestones, the year chips)
    air(c, dry, 'bandpass', 2200, 1500, 4, t, 0.04, 0.09, 0.001);
    tone(c, dry, 'sine', 300, 160, t, 0.05, 0.04, 0.001);
  },

  // ---- the banner
  field(c, dry, wet, t) {
    // the shield taking a blow: steel struck against it (new every time), the field's own
    // resonance swelling under it, and the shock thrown into the room
    const f = rnd(180, 420), heavy = Math.random() < 0.4;
    tone(c, dry, 'sine', rnd(120, 170), 38, t, 0.8, 0.26, 0.002); // the body of the hit
    metal(c, dry, wet, t, { f, ring: rnd(1.4, 2.4), gain: heavy ? 0.07 : 0.05, bright: rnd(0.3, 0.8), ratios: [1, rnd(2.4, 2.9), rnd(4.8, 5.8), rnd(8, 9.6), rnd(11.5, 14)] });
    if (heavy) metal(c, dry, wet, t + rnd(0.05, 0.1), { f: f * rnd(1.3, 1.7), ring: 0.9, gain: 0.03, bright: 0.6 }); // a second, lighter strike
    // the field ringing: a pure tone with a fast shimmer, rising then sinking
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    const base = rnd(700, 1000);
    o.type = 'sine';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 1.4);
    lfo.frequency.value = rnd(18, 28);
    lg.gain.value = base * 0.02;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(wet);
    o.start(t); lfo.start(t);
    o.stop(t + 1.5); lfo.stop(t + 1.5);
    air(c, wet, 'bandpass', 6000, 600, 4, t, 0.9, 0.05, 0.004);
  },
  unplug(c, dry, wet, t) { // the umbilical cable ejecting: a pneumatic hiss, a clunk, power winding down
    air(c, dry, 'highpass', 3000, 1200, 0.8, t, 0.35, 0.08, 0.002);
    tone(c, dry, 'sine', 120, 50, t + 0.03, 0.15, 0.2, 0.001);
    metal(c, dry, wet, t + 0.03, { f: 520, ring: 0.5, gain: 0.03, bright: 0.3 });
    servo(c, wet, 160, 35, t + 0.1, 1.1, 0.05);
  },
  plug(c, dry, wet, t) { // plugging back in: a clunk and power winding up
    tone(c, dry, 'sine', 150, 60, t, 0.12, 0.2, 0.001);
    metal(c, dry, wet, t, { f: 600, ring: 0.4, gain: 0.03, bright: 0.3 });
    servo(c, wet, 40, 180, t + 0.05, 0.8, 0.05);
  },
  wake(c, dry, wet, t) { // the mech's eyes lighting, timed to the two flares: a latch, a short clean thud,
    // a capacitor charging up, and a bright two-note ping with a crackle on each flash. Nothing low and buzzy.
    metal(c, dry, wet, t, { f: rnd(1700, 1900), ring: 0.12, gain: 0.018, bright: 0.8 });
    tone(c, dry, 'sine', 95, 55, t, 0.14, 0.11, 0.001);
    tone(c, dry, 'triangle', 700, 2600, t + 0.01, 0.34, 0.018, 0.02);
    tone(c, wet, 'sine', 350, 1300, t + 0.01, 0.34, 0.01, 0.02);
    [0, 0.105].forEach((d, i) => {
      tone(c, dry, 'sine', 1568, 1568, t + d, 0.32, 0.022 - i * 0.004, 0.002);
      tone(c, wet, 'sine', 2349, 2349, t + d + 0.012, 0.42, 0.016 - i * 0.003, 0.002);
      air(c, dry, 'highpass', 5200, 5200, 0.7, t + d, 0.05, 0.03, 0.001);
    });
  },

  // ---- the pet and the spear
  pet(c, dry, _w, t) { // a stroke: fabric, nothing more
    air(c, dry, 'bandpass', rnd(1500, 2200), rnd(900, 1300), 1.5, t, 0.14, 0.03, 0.05);
  },
  angry(c, dry, wet, t) { // over-petting: a warning klaxon, twice
    [0, 0.16].forEach((d) => {
      tone(c, dry, 'square', 740, 740, t + d, 0.11, 0.025, 0.004);
      tone(c, wet, 'square', 555, 555, t + d, 0.11, 0.02, 0.004);
    });
  },
  alert(c, dry, _w, t) { // woken with a start: one sharp beep
    tone(c, dry, 'square', 1975, 1975, t, 0.07, 0.025, 0.001);
  },
  whoosh(c, dry, wet, t, amount) { // a spear cutting the air: a band of noise sweeping up then away, with a low rush
    const d = 0.32 + 0.2 * amount;
    air(c, dry, 'bandpass', 500, 3800, 2.5, t, d * 0.45, 0.14 * amount, d * 0.35);
    air(c, wet, 'bandpass', 3800, 700, 2.5, t + d * 0.4, d * 0.6, 0.08 * amount, 0.01);
    air(c, dry, 'lowpass', 300, 160, 1, t, d, 0.08 * amount, d * 0.3);
  },
  clang(c, dry, wet, t, amount) { // the spear biting into the floor: a thud, then the steel ringing
    tone(c, dry, 'sine', 110, 42, t, 0.25, 0.22 * amount, 0.001);
    air(c, dry, 'lowpass', 1500, 400, 1, t, 0.12, 0.12 * amount, 0.001);
    metal(c, dry, wet, t, { f: rnd(310, 380), ring: 1.6 * amount + 0.4, gain: 0.06 * amount, bright: 0.6 });
    metal(c, dry, wet, t + 0.004, { f: rnd(1150, 1400), ring: 0.6, gain: 0.025 * amount, bright: 0.8 });
  },
  ricochet(c, dry, wet, t, amount) { // glancing off a wall: a sharp bright strike and a ringing that whines away
    air(c, dry, 'highpass', 3000, 3000, 0.7, t, 0.03, 0.14 * amount, 0.0005);
    tone(c, dry, 'sine', 180, 70, t, 0.12, 0.12 * amount, 0.001);
    metal(c, dry, wet, t, { f: rnd(620, 780), ring: 0.9 + 0.8 * amount, gain: 0.055 * amount, bright: 0.85 });
    tone(c, wet, 'sine', rnd(2600, 3000), rnd(1500, 1800), t + 0.01, 0.35, 0.012 * amount, 0.002);
  },
  // The Easter egg's card: a latch letting go and a snap at the centre (going into the light is charge(), below).
  emerge(c, dry, _w, t) { // the avatar's edge letting go of the card: a faint latch releasing
    air(c, dry, 'bandpass', 3400, 2600, 5, t, 0.014, 0.05, 0.0005);
    tone(c, dry, 'sine', 210, 130, t, 0.035, 0.025, 0.001);
  },
  seat(c, dry, wet, t) { // the card settling firmly at the centre: a distinct snap, a crisp click on a magnetic thump
    air(c, dry, 'bandpass', 4200, 3200, 6, t, 0.01, 0.22, 0.0003);
    air(c, dry, 'highpass', 6000, 6000, 0.7, t, 0.006, 0.06, 0.0002);
    tone(c, dry, 'sine', 170, 72, t, 0.08, 0.11, 0.0008);
    tone(c, wet, 'sine', 170, 72, t, 0.06, 0.02, 0.0008);
  },
  knock(c, dry, wet, t) { // landing on its tail: a duller, shorter hit
    tone(c, dry, 'sine', 140, 60, t, 0.12, 0.12, 0.001);
    metal(c, dry, wet, t, { f: rnd(500, 650), ring: 0.35, gain: 0.03, bright: 0.2 });
  },
  grab(c, dry, wet, t) { // picked up: a light scrape of steel
    air(c, dry, 'bandpass', 2800, 4200, 8, t, 0.12, 0.04, 0.02);
    metal(c, dry, wet, t, { f: 1600, ring: 0.25, gain: 0.012, bright: 0.8 });
  },
  pull(c, dry, wet, t) { // pulled out of the floor: grit, a scrape, then it rings free
    air(c, dry, 'bandpass', 900, 2600, 3, t, 0.25, 0.08, 0.05);
    metal(c, dry, wet, t + 0.2, { f: rnd(330, 380), ring: 0.9, gain: 0.03, bright: 0.5 });
  },
};

export function sound(cue: Cue, pan = 0, amount = 1) {
  if (document.documentElement.dataset.sound !== 'on') return;
  try {
    const c = setup();
    // until a click unlocks audio, hovers are dropped rather than piling up to play all at once
    if (c.state !== 'running' && HOVERS.has(cue)) return;
    const t0 = c.currentTime + 0.005;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out!);
    const wet = c.createGain();
    wet.connect(p);
    wet.connect(room!);

    const file = SFX[cue];
    // a recording is nudged in pitch each time, so repeats don't sound stamped out
    if (file) return void playFile(c, file, p, cue === 'field' ? rnd(0.93, 1.07) : 1);
    CUES[cue](c, p, wet, t0, amount);
  } catch {}
}

const load = (c: AudioContext, url: string) => {
  if (!files.has(url)) files.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).catch(() => null));
  return files.get(url)!;
};

async function playFile(c: AudioContext, url: string, dest: AudioNode, rate = 1) {
  const buf = await load(c, url);
  if (!buf) return;
  const s = c.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start();
}

/**
 * The mech straining while it is held: a low servo drone (its only sound) that climbs and thickens as
 * `set(s)` goes from 0 to 1. `stop()` lets it die away; `stop(true)` drops it like a motor letting go.
 */
export function strain() {
  if (document.documentElement.dataset.sound !== 'on') return null;
  try {
    const c = setup(), t = c.currentTime;
    const g = c.createGain(), f = c.createBiquadFilter(), a = c.createOscillator(), b = c.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth';
    a.frequency.value = 44; b.frequency.value = 44 * 1.498; b.detune.value = 9;
    f.type = 'lowpass'; f.Q.value = 7; f.frequency.value = 160;
    g.gain.setValueAtTime(0.0001, t);
    a.connect(f); b.connect(f); f.connect(g); g.connect(out!); g.connect(room!);
    a.start(t); b.start(t);
    let done = false;
    return {
      set(s: number) {
        if (done) return;
        const n = c.currentTime, k = Math.max(0, Math.min(1, s));
        a.frequency.setTargetAtTime(44 + k * 52, n, 0.06);
        b.frequency.setTargetAtTime((44 + k * 52) * 1.498, n, 0.06);
        f.frequency.setTargetAtTime(160 + k * k * 1300, n, 0.06);
        g.gain.setTargetAtTime(0.012 + k * 0.06, n, 0.08);
      },
      stop(release = false) {
        if (done) return;
        done = true;
        const n = c.currentTime, d = release ? 0.5 : 0.18;
        if (release) { a.frequency.setTargetAtTime(30, n, 0.12); b.frequency.setTargetAtTime(45, n, 0.12); f.frequency.setTargetAtTime(120, n, 0.1); }
        g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0.0001, n, d / 4);
        a.stop(n + d + 0.1); b.stop(n + d + 0.1);
      },
    };
  } catch { return null; }
}

/**
 * The Easter egg's card going into the line of light: not a noise but a soft, warm tone that climbs as the card
 * goes in, like a reader taking it, so it hands over to the music that follows. Two sines a fifth apart under a
 * gentle lowpass, a faint octave shimmer, a slow breath of tremolo. `set(level, progress)` (both 0 to 1) drives it
 * every frame: `level` is how present it is (0 when the card is not in the light; a little louder while it moves),
 * `progress` how far in it is (the pitch rises an octave and the tone opens). `stop()` lets it fade.
 */
export function charge() {
  if (document.documentElement.dataset.sound !== 'on') return null;
  try {
    const c = setup(), t = c.currentTime;
    const lp = c.createBiquadFilter(), g = c.createGain(), trem = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.value = 700;
    const root = c.createOscillator(), fifth = c.createOscillator(), top = c.createOscillator();
    const rG = c.createGain(), fG = c.createGain(), tG = c.createGain();
    root.type = 'sine'; fifth.type = 'sine'; top.type = 'triangle';
    root.frequency.value = 196; fifth.frequency.value = 294; top.frequency.value = 392;
    rG.gain.value = 1; fG.gain.value = 0.45; tG.gain.value = 0.05;
    root.connect(rG).connect(lp); fifth.connect(fG).connect(lp); top.connect(tG).connect(lp);
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 4.2; lfoG.gain.value = 0.12; trem.gain.value = 0.88;
    lfo.connect(lfoG).connect(trem.gain);
    lp.connect(trem).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.connect(out!); g.connect(room!);
    [root, fifth, top, lfo].forEach((o) => o.start(t));
    let done = false;
    return {
      set(level: number, progress: number) {
        if (done) return;
        const n = c.currentTime, l = Math.max(0, Math.min(1, level)), p = Math.max(0, Math.min(1, progress));
        const f = 196 * Math.pow(2, p); // G3 up to G4
        root.frequency.setTargetAtTime(f, n, 0.06);
        fifth.frequency.setTargetAtTime(f * 1.5, n, 0.06);
        top.frequency.setTargetAtTime(f * 2, n, 0.06);
        lp.frequency.setTargetAtTime(600 + p * 1800, n, 0.08);
        g.gain.setTargetAtTime(0.0001 + l * 0.045, n, l > 0.01 ? 0.05 : 0.12);
      },
      stop() {
        if (done) return;
        done = true;
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0.0001, n, 0.25);
        [root, fifth, top, lfo].forEach((o) => o.stop(n + 1.6));
      },
    };
  } catch { return null; }
}
