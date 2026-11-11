// Damped springs: the one motion model behind the site's interface animations, so things settle the
// way real objects do (overshoot a little, ring down) instead of sliding along a fixed curve.
// CSS transitions use the same springs, baked into the --spring and --spring-soft easings in site.css.

export interface SpringOpts {
  /** pull toward the target (per second squared) */
  stiffness?: number;
  /** friction; at 2 * sqrt(stiffness) it settles without overshooting */
  damping?: number;
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  k: number;
  c: number;
  constructor(value: number, { stiffness = 170, damping = 14 }: SpringOpts = {}) {
    this.value = value;
    this.target = value;
    this.k = stiffness;
    this.c = damping;
  }
  /** advance by dt seconds, in small fixed steps so a slow frame cannot blow it up */
  step(dt: number) {
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      const a = this.k * (this.target - this.value) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }
  get settled() {
    return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.01;
  }
  /** a flick: add velocity without moving the target */
  kick(v: number) {
    this.velocity += v;
  }
}

/** Runs `frame(dt)` every animation frame until it returns false. */
export function animate(frame: (dt: number) => boolean) {
  let last = performance.now();
  const tick = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (frame(dt)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Gives an element a springy press: it squashes, then rings back to rest.
 * The transform goes on `target` (the icon), so the button's own box never moves.
 */
const pressing = new WeakMap<Element, Spring>();
export function press(target: SVGElement | HTMLElement, strength = 1) {
  let s = pressing.get(target);
  const fresh = !s;
  s ??= new Spring(1, { stiffness: 520, damping: 16 });
  pressing.set(target, s);
  s.kick(-9 * strength);
  if (!fresh) return; // already ringing: the kick joins the running animation
  animate((dt) => {
    s!.step(dt);
    const v = s!.value, tilt = (1 - v) * 40;
    target.style.transform = `scale(${v.toFixed(3)}) rotate(${tilt.toFixed(2)}deg)`;
    if (s!.settled) {
      target.style.transform = '';
      pressing.delete(target);
      return false;
    }
    return true;
  });
}
