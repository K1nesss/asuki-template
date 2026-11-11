// The prop on the caution tape: something long and thin the pet can throw, drawn in the pet's pixel cells,
// head to the right: a spear, a javelin, a harpoon.
//
// It moves as a rigid body, like a javelin. Its weight sits toward the head, so:
// - picked up, it swings from wherever you hold it like a pendulum (hold it near the balance point and
//   it stays level; hold it by the tail and the head drops), and it sways as you carry it;
// - let go, it keeps the speed and spin your hand gave it, slows a little in the air, and turns head-first
//   into its own path like a dart, with a wobble as it settles;
// - it lands tip first and quivers in the tape. If the tail touches down first, it bounces and turns over.
// Drop it on the pet and she raises it, winds up and throws it. Now and then she walks over, pulls it out of
// the tape and throws it on her own. Cross, she won't take it; asleep, it wakes her. Enter hands it to her.
import persona from '@persona';
import { clamp, rand, loopWhileVisible } from './paint';
import { mountFx } from './prop-fx';
import { sound } from './sound';
import type { PetApi } from './pet';

type Mode = 'rest' | 'drag' | 'held' | 'fly' | 'fetched';

const SP = persona.prop?.sprite ?? { rows: [''], map: {} };
const COLS = SP.rows[0].length, ROWS = SP.rows.length;
const TAPE = 6;
const HOLD = 0.34;       // where her hand is, as a share of the length behind the balance point
const COM = 0.16;        // the balance point, as a share of the length ahead of the middle (toward the head)
// A steel spear is dense and slender: the air hardly slows it, but it weathercocks hard, so it tracks its
// own path like a javelin rather than drifting and tumbling. Gravity is scaled for a 140px yard (real g at
// this scale reads as slow motion: small things on screen look floaty unless they fall faster than life).
const AIR_DRAG = 0.08;   // per second
const ALIGN = 0.00032;   // how hard the air turns it head-first, per (px/s)^2
const SPIN_DAMP = 2.5;   // per second, in the air, plus more with speed
const SWING_DAMP = 1.2;  // per second, while carried (a loose grip lets it swing)
// Carried, it hangs from your pointer by a stiff, damped joint at the grab point, not glued to it: it has
// its own mass, so it lags behind a fast hand, sags a few pixels under its own weight, swings, and when you
// let go it flies on with exactly the momentum it had, not the pointer's speed.
const GRIP_K = 260;      // joint stiffness per unit mass (1/s^2): sag = g / GRIP_K
const GRIP_C = 22;       // joint damping, against the hand's own motion (1/s)
const FETCH_AFTER = [9, 20]; // seconds the spear sits before she might go and get it herself

export function mountProp(yard: HTMLElement, pet: PetApi, opts: { reduce: boolean }) {
  const el = yard.querySelector<HTMLElement>('#prop');
  if (!el) return;

  let L = 0, T = 0; // drawn length and thickness, px
  // state: the balance point (x, y), its velocity, the angle (radians, 0 = head to the right) and spin
  let x = 0, y = 0, vx = 0, vy = 0, a = 0, w = 0;
  let mode: Mode = 'rest';
  let grabS = 0;                       // where along the shaft it is held, from the balance point (px)
  let ptr = { x: 0, y: 0 }, hand = { x: 0, y: 0, vx: 0, vy: 0 };
  let quiver = { t: 9, amp: 0, base: 0, tipX: 0 };
  let restFor = 0, nextFetch = rand(FETCH_AFTER[0], FETCH_AFTER[1]);
  const ground = () => yard.clientHeight - TAPE;
  const bury = () => 3 * pet.cell();
  const g = () => 1500 * pet.cell(); // gravity, scaled with the yard so phone and desktop feel the same
  const fx = mountFx(yard, opts.reduce);

  const ux = () => Math.cos(a), uy = () => Math.sin(a);
  const centre = () => ({ x: x - ux() * COM * L, y: y - uy() * COM * L });
  const end = (s: number) => ({ x: x + ux() * s, y: y + uy() * s }); // a point s px from the balance point
  const tip = () => end(L * (0.5 - COM));
  const tail = () => end(-L * (0.5 + COM));

  function measure() {
    const c = pet.cell();
    L = COLS * c;
    T = ROWS * c;
    el!.style.width = `${L}px`;
    el!.style.height = `${T}px`;
  }
  function place() {
    const c = centre();
    el!.style.transform = `translate(${c.x - L / 2}px, ${c.y - T / 2}px) rotate(${a}rad)`;
  }
  /** in the tape with its tip at tx, leaning at angle `ang`; `hit` is how hard it went in */
  function stickAt(tx: number, ang: number, hit = 0) {
    a = ang;
    const s = L * (0.5 - COM);
    x = tx - Math.cos(a) * s;
    y = ground() + bury() - Math.sin(a) * s;
    vx = vy = w = 0;
    mode = 'rest';
    restFor = 0;
    quiver = { t: 0, amp: opts.reduce ? 0 : clamp(hit / 4000, 0, 0.14), base: a, tipX: tx };
    place();
  }

  // ---- carrying it
  const local = (e: PointerEvent) => {
    const r = yard.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  el.addEventListener('pointerdown', (e) => {
    if (mode === 'held' || mode === 'fetched') return;
    e.preventDefault();
    e.stopPropagation(); // not a tap on the tape
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    // where along the shaft did it get picked up?
    grabS = clamp((p.x - x) * ux() + (p.y - y) * uy(), -L * (0.5 + COM), L * (0.5 - COM));
    ptr = { x: p.x, y: p.y };
    hand = { x: p.x, y: p.y, vx: 0, vy: 0 };
    vx = vy = w = 0;
    mode = 'drag';
    el.classList.add('dragging');
    sound('grab');
  });
  el.addEventListener('pointermove', (e) => {
    if (mode !== 'drag') return;
    const p = local(e);
    ptr = { x: p.x, y: Math.min(p.y, ground() - 4) };
    const b = pet.box();
    if (Math.abs(p.x - (b.x + b.w / 2)) < b.w * 1.6) pet.watch();
  });
  const drop = () => {
    if (mode !== 'drag') return;
    el.classList.remove('dragging');
    const b = pet.box(), c = centre();
    const onHer = c.x > b.x - L * 0.2 && c.x < b.x + b.w + L * 0.2 && c.y > ground() - b.h * 1.4;
    if (onHer) return handOver();
    // let go: it simply keeps the speed and spin it already has
    vx = clamp(vx, -1800, 1800);
    vy = clamp(vy, -1400, 1600);
    w = clamp(w, -7, 7); // a wrist lets go of a spear with a turn, not a propeller's spin
    mode = 'fly';
    const sp = Math.hypot(vx, vy);
    if (sp > 300) sound('whoosh', (x / yard.clientWidth) * 2 - 1, clamp(sp / 900, 0.4, 1)); // flung hard enough to cut the air
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && (mode === 'rest' || mode === 'fly')) {
      e.preventDefault();
      handOver();
    }
  });

  function handOver() {
    const m = pet.mood();
    if (m !== 'ok') {
      pet.refuse();
      vx = 0; vy = -80; w = 0;
      mode = 'fly';
      return;
    }
    mode = 'held';
    el!.classList.add('held');
    pet.take(launch);
  }

  // she lets go: aim the tip at a spot down the tape and let gravity do the rest
  function launch(dir: -1 | 1) {
    el!.classList.remove('held');
    const W = yard.clientWidth, b = pet.box();
    const from = b.x + b.w / 2, room = dir > 0 ? W - from : from;
    const land = from + dir * clamp(room * rand(0.78, 0.95), Math.min(room, L), room - L * 0.3);
    const t0 = tip();
    fx.release(t0.x, t0.y, dir);
    if (opts.reduce) {
      stickAt(land, dir > 0 ? 0.75 : Math.PI - 0.75);
      sound('clang', (land / yard.clientWidth) * 2 - 1);
      fx.impact(land, ground(), dir);
      pet.cheer();
      return;
    }
    // a hard, flat throw: the further the mark, the longer it's in the air, but never a lazy lob
    const flight = clamp(0.36 + Math.abs(land - t0.x) * 0.00036, 0.42, 0.72), slow = (1 - Math.exp(-AIR_DRAG * flight)) / AIR_DRAG;
    vx = (land - t0.x) / slow;
    vy = (ground() + bury() - t0.y - 0.5 * g() * flight * flight) / flight;
    w = dir * -1.6; // a flick of the wrist: the head dips through the flight
    mode = 'fly';
  }

  // she goes and gets it herself
  function fetch() {
    const t0 = tip();
    pet.fetch(t0.x, () => {
      if (mode !== 'rest') return;
      sound('pull', (tip().x / yard.clientWidth) * 2 - 1);
      fx.impact(tip().x, ground(), 0, 0.35); // a little dust as it comes out
      mode = 'fetched';
      el!.classList.add('held');
      pet.take(launch);
    });
  }

  // ---- every frame
  function step(dt: number) {
    switch (mode) {
      case 'drag': {
        // the hand's own velocity, from where the pointer has got to this frame (smoothed a touch)
        const k = Math.min(1, dt * 30);
        hand.vx += ((ptr.x - hand.x) / Math.max(dt, 1e-3) - hand.vx) * k;
        hand.vy += ((ptr.y - hand.y) / Math.max(dt, 1e-3) - hand.vy) * k;
        hand.x = ptr.x; hand.y = ptr.y;
        const I = (L * L) / 12; // a rod about its balance point, unit mass
        for (let left = Math.min(dt, 0.05); left > 1e-6; ) {
          const h = Math.min(left, 1 / 240);
          left -= h;
          const rx = Math.cos(a) * grabS, ry = Math.sin(a) * grabS; // balance point -> the grab point
          const pvx = vx - w * ry, pvy = vy + w * rx;               // the grab point's velocity
          const fx = GRIP_K * (ptr.x - (x + rx)) + GRIP_C * (hand.vx - pvx);
          const fy = GRIP_K * (ptr.y - (y + ry)) + GRIP_C * (hand.vy - pvy);
          vx += fx * h;
          vy += (fy + g()) * h;
          w += ((rx * fy - ry * fx) / I) * h;
          w *= Math.exp(-SWING_DAMP * h);
          x += vx * h; y += vy * h; a += w * h;
          // never through the tape: it scrapes along it
          const lo = Math.max(tip().y, tail().y);
          if (lo > ground()) { y -= lo - ground(); if (vy > 0) vy *= -0.15; vx *= 0.96; w *= 0.9; }
        }
        break;
      }
      case 'held':
      case 'fetched': {
        // in her hand: she grips it back toward the tail, a third of the way up from the end, head well out in front
        const gp = pet.grip();
        const k = Math.min(1, dt * (mode === 'fetched' ? 8 : 18));
        x += (gp.x + Math.cos(gp.a) * L * HOLD - x) * k;
        y += (gp.y + Math.sin(gp.a) * L * HOLD - y) * k;
        a += (gp.a - a) * k;
        if (mode === 'fetched' && Math.abs(gp.a - a) < 0.05) mode = 'held';
        break;
      }
      case 'fly': {
        vy += g() * dt;
        const drag = Math.exp(-AIR_DRAG * dt);
        vx *= drag; vy *= drag;
        x += vx * dt;
        y += vy * dt;
        // the air turns it head-first (the weight is forward of the middle), with some overshoot
        const sp2 = vx * vx + vy * vy;
        const want = Math.atan2(vy, vx);
        w += ALIGN * sp2 * Math.sin(normal(want - a)) * dt;
        w *= Math.exp(-(SPIN_DAMP + Math.sqrt(sp2) * 0.006) * dt); // the air damps the wobble harder the faster it goes
        a += w * dt;
        if (sp2 > 260 * 260) fx.trail(tip().x, tip().y);
        // the ends of the yard are walls: whichever end of the spear reaches one glances off it with a ring of steel
        const W = yard.clientWidth;
        const t1 = tip(), t2 = tail(), speed = Math.sqrt(sp2);
        const lo = Math.min(t1.x, t2.x), hi = Math.max(t1.x, t2.x);
        if ((lo < 0 && vx < 0) || (hi > W && vx > 0)) {
          const side = lo < 0 && vx < 0 ? -1 : 1;
          const at = side < 0 ? (t1.x < t2.x ? t1 : t2) : (t1.x > t2.x ? t1 : t2);
          const hit = clamp(Math.abs(vx) / 600, 0.3, 1), loud = Math.abs(vx) > 60;
          x -= side < 0 ? lo : hi - W;
          vx *= -0.35; w = -w * 0.5 + side * clamp(speed / 150, 1, 6) * (at === t1 ? 1 : -1);
          if (loud) { sound('ricochet', side, hit); fx.spark(side < 0 ? 0 : W, at.y, side, hit); }
          break;
        }
        if (t1.y >= ground() + bury() * 0.5 && t1.y >= t2.y) {
          // tip first: into the tape. Too shallow and it still digs in, at a lean
          const lean = Math.sin(a) >= 0.45 ? a : Math.cos(a) >= 0 ? 0.85 : Math.PI - 0.85;
          stickAt(t1.x, lean, speed);
          sound('clang', (t1.x / yard.clientWidth) * 2 - 1, clamp(speed / 700, 0.35, 1));
          fx.impact(t1.x, ground(), Math.cos(lean) >= 0 ? 1 : -1, clamp(speed / 700, 0.4, 1));
          pet.cheer();
        } else if (t2.y >= ground() && vy > 0) {
          // tail first: it bounces and turns over
          y -= t2.y - ground();
          vy *= -0.25;
          vx *= 0.6;
          w += (Math.cos(a) >= 0 ? 1 : -1) * clamp(speed / 120, 2, 9);
          sound('knock', (t2.x / yard.clientWidth) * 2 - 1);
          fx.impact(t2.x, ground(), 0, 0.3);
        }
        break;
      }
      case 'rest': {
        restFor += dt;
        // the shaft rings after it goes in: a quick, dying wobble about the buried tip
        if (quiver.amp && quiver.t < 1.4) {
          quiver.t += dt;
          a = quiver.base + quiver.amp * Math.exp(-quiver.t * 4.5) * Math.sin(quiver.t * 38);
          const s = L * (0.5 - COM);
          x = quiver.tipX - Math.cos(a) * s;
          y = ground() + bury() - Math.sin(a) * s;
          break;
        }
        if (!opts.reduce && restFor > nextFetch && pet.mood() === 'ok' && pet.idle()) {
          nextFetch = rand(FETCH_AFTER[0], FETCH_AFTER[1]) * 1.5;
          restFor = 0;
          fetch();
        }
        return;
      }
    }
    place();
  }

  measure();
  // it starts in the tape near the left end, as if she threw it there earlier
  stickAt(yard.clientWidth * 0.1 + L * 0.35, 1.05);
  el.classList.add('ready');
  new ResizeObserver(() => {
    const wasX = tip().x / Math.max(1, yard.clientWidth);
    measure();
    if (mode === 'rest') stickAt(clamp(wasX * yard.clientWidth, L * 0.4, yard.clientWidth - 4), quiver.base || a);
  }).observe(yard);
  loopWhileVisible(yard, (dt) => { step(dt); fx.step(dt); }, () => mode === 'fly' || mode === 'drag');
}

/** an angle folded into -π..π, so it turns the short way round */
function normal(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
