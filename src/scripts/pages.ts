// The four full pages (Projects, Contributions, Milestones, Loadout), laid over the homepage.
// Opening one: the panel grows into the page. The page is cut to the panel's rectangle, which springs
// out to fill the screen with an orange-cornered frame on its edge, while the homepage darkens and the
// page's contents rise in. Closing (the back corner, Esc, or the browser's Back) runs it backwards: the
// page shrinks back into its panel and fades there.
// Each page has its own address, so /projects can be linked to and reloaded.
import { Spring } from './spring';
import { sound } from './sound';
import { screen, type Screen } from './glow';

type Name = 'projects' | 'contributions' | 'milestones' | 'loadout';
const NAMES: Name[] = ['projects', 'contributions', 'milestones', 'loadout'];
const nameOf = (path: string) => (NAMES as string[]).includes(path.replace(/\/+$/, '').slice(1)) ? (path.replace(/\/+$/, '').slice(1) as Name) : null;

interface Rect { x: number; y: number; w: number; h: number }
interface Hooks { enter?(): void; leave?(): void; frame?(dt: number): void }

const $ = <T extends Element = HTMLElement>(sel: string, root: Pick<Document, 'querySelector' | 'querySelectorAll'> = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: Pick<Document, 'querySelector' | 'querySelectorAll'> = document) => [...root.querySelectorAll<T>(sel)];
const panOf = (r: Rect) => (((r.x + r.w / 2) / innerWidth) * 2 - 1) * 0.5;

export function mountPages(reduce: boolean) {
  const layer = document.getElementById('views');
  const home = document.getElementById('page');
  if (!layer || !home) return;
  const html = document.documentElement;
  const view = (n: Name) => document.getElementById(`v-${n}`)!;

  // ---------- one frame loop, running only while a page is open or a frame is flying
  const tasks = new Set<(dt: number) => boolean | void>();
  let raf = 0, last = 0, current: Name | null = null, busy = false, origin: Element | null = null;
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    for (const f of [...tasks]) if (f(dt) === false) tasks.delete(f);
    if (current) hooks[current].frame?.(dt);
    raf = current || tasks.size ? requestAnimationFrame(frame) : 0;
  };
  const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

  // whether the last thing the visitor did was on the keyboard (focus moves only for them)
  let keyed = false;
  addEventListener('keydown', () => (keyed = true), true);
  addEventListener('pointerdown', () => (keyed = false), true);
  const rectOf = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const panelOf = (n: Name) => $(`.more[data-open="${n}"]`)?.closest('.panel, .cards') ?? null;
  const onScreen = (r: Rect) => r.y + r.h > 0 && r.y < innerHeight && r.w > 0;
  const centre = (): Rect => ({ x: innerWidth / 2 - 40, y: innerHeight / 2 - 30, w: 80, h: 60 });

  // ---------- the morph: the page layer is cut to a rectangle that springs between the panel and the
  // whole screen (a clip-path, so nothing inside it is resized or re-laid out), and an orange-cornered
  // frame rides its edge. Both run as CSS transitions on the site's spring curve, so the browser keeps
  // them smooth even while the page underneath is busy. Behind it a scrim darkens the homepage.
  const scrim = document.createElement('div');
  scrim.className = 'page-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  const fr = document.createElement('div');
  fr.className = 'page-frame';
  fr.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);
  document.body.appendChild(fr);
  const OPEN_MS = 720, CLOSE_MS = 620;
  const inset = (r: Rect) => {
    const W = layer.clientWidth || innerWidth, H = layer.clientHeight || innerHeight;
    return `inset(${r.y.toFixed(1)}px ${(W - r.x - r.w).toFixed(1)}px ${(H - r.y - r.h).toFixed(1)}px ${r.x.toFixed(1)}px)`;
  };
  const place = (r: Rect) => Object.assign(fr.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  let morphT = 0;
  function morph(from: Rect, to: Rect, ms: number, done: () => void) {
    clearTimeout(morphT);
    layer!.style.transition = fr.style.transition = 'none';
    layer!.style.clipPath = inset(from);
    place(from);
    fr.classList.add('on');
    void layer!.offsetWidth;
    const ease = `${ms}ms var(--spring-soft)`;
    layer!.style.transition = `clip-path ${ease}, opacity .18s`;
    fr.style.transition = `left ${ease}, top ${ease}, width ${ease}, height ${ease}, opacity .25s`;
    layer!.style.clipPath = inset(to);
    place(to);
    morphT = window.setTimeout(done, ms);
  }
  const full = (): Rect => ({ x: 0, y: 0, w: layer.clientWidth || innerWidth, h: innerHeight });

  // ---------- open and close
  function cover(on: boolean) {
    if (on) html.dataset.paged = '';
    else delete html.dataset.paged;
    dispatchEvent(new Event('site:paged')); // the homepage's animations rest while it is covered
  }
  function show(n: Name) {
    const v = view(n);
    layer!.hidden = false;
    layer!.classList.remove('leaving');
    v.classList.remove('exit');
    void v.offsetWidth;
    v.classList.add('on', 'enter');
    v.scrollTop = 0;
    current = n;
    hooks[n].enter?.();
    if (keyed) v.focus({ preventScroll: true });
    run();
  }
  function hide(n: Name) {
    const v = view(n);
    v.classList.remove('on', 'enter', 'exit');
    hooks[n].leave?.();
    current = null;
    layer!.hidden = true;
    layer!.classList.remove('leaving');
    layer!.style.clipPath = layer!.style.transition = '';
  }

  function open(n: Name, from: Element | null, instant = false) {
    if (busy || current === n) return;
    if (current) hide(current);
    origin = from;
    html.dataset.lock = '';
    if (instant || reduce) { cover(true); show(n); return; }
    busy = true;
    const r = from ? rectOf(from) : null;
    sound('open', r ? panOf(r) : 0);
    scrim.classList.add('on');
    // the homepage's own animations hold still from here, so the page has the frames to itself
    html.dataset.morph = '';
    cover(true);
    show(n);
    morph(r && onScreen(r) ? r : centre(), full(), OPEN_MS, () => {
      layer!.style.clipPath = layer!.style.transition = '';
      fr.classList.remove('on');
      delete html.dataset.morph;
      busy = false;
    });
  }

  function close() {
    if (busy || !current) return;
    const n = current;
    const more = $<HTMLElement>(`.more[data-open="${n}"]`);
    if (reduce) { hide(n); cover(false); delete html.dataset.lock; if (keyed) more?.focus({ preventScroll: true }); return; }
    busy = true;
    sound('close');
    html.dataset.morph = ''; // the homepage shows again underneath, still at rest until the page is gone
    // back into the panel it came out of; if that is off screen (the page was opened from the menu,
    // or the visit started on this page), bring the panel into view first
    const to = origin && origin.isConnected && onScreen(rectOf(origin)) ? origin : panelOf(n);
    if (to && !onScreen(rectOf(to))) to.scrollIntoView({ block: 'center' });
    view(n).classList.add('exit');
    scrim.classList.remove('on');
    morph(full(), to ? rectOf(to) : centre(), CLOSE_MS, () => {
      // seated in the panel: the frame and the last of the page fade, showing the panel itself
      fr.classList.remove('on');
      layer!.classList.add('leaving');
      morphT = window.setTimeout(() => {
        hide(n);
        delete html.dataset.morph;
        cover(false);
        delete html.dataset.lock;
        busy = false;
      }, 180);
    });
    if (keyed) more?.focus({ preventScroll: true }); // keyboard users land back on the corner they left from
  }

  // ---------- addresses: opening a page pushes /name; Back (or the back corner) returns to /
  const go = (n: Name, from: Element | null) => {
    if (busy || current === n) return;
    history.pushState({ page: n }, '', `/${n}`);
    open(n, from);
  };
  const leave = () => {
    if (busy || !current) return;
    if ((history.state as { page?: string } | null)?.page) history.back(); // popstate closes it
    else { history.replaceState(null, '', '/'); close(); }
  };
  addEventListener('popstate', () => {
    const n = nameOf(location.pathname);
    if (n && n !== current) open(n, panelOf(n), !!current);
    else if (!n && current) close();
  });
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target as Element;
    const opener = t.closest<HTMLElement>('[data-open]');
    if (opener) {
      e.preventDefault();
      const n = opener.dataset.open as Name;
      // the corner opens out of its panel; a header or menu link opens out of itself
      go(n, opener.classList.contains('more') ? panelOf(n) : opener);
      return;
    }
    if (t.closest('.view .back')) { e.preventDefault(); leave(); }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { e.preventDefault(); leave(); } });

  // ======================================================================== PROJECTS: a shelf of cases
  const pv = view('projects');
  const shelf = $('.shelf', pv)!;
  const cases = $$('.case', pv);
  const infos = $$('.pinfo', pv);
  const ticks = $$('.ticks button', pv);
  const info = $('.info', pv)!;
  const floor = $('.floor', pv)!;
  const covers = new Map<number, Screen>();
  cases.forEach((c, i) => {
    const cv = $<HTMLCanvasElement>('canvas.cover', c);
    if (cv) covers.set(i, screen(cv, Number(c.dataset.kind), 64, 64, i + 3, i * 0.7, !reduce));
  });
  const recolour = () => covers.forEach((s) => { s.recolour(); if (reduce) s.draw(0, 0); });
  // at once, so a screen the theme circle has reached never shows the old colour for a few frames (and
  // again a little later, where the colours cross-fade instead of the circle)
  addEventListener('site:theme', () => { recolour(); setTimeout(recolour, 500); });
  if (reduce) covers.forEach((s) => { for (let k = 0; k < 40; k++) s.draw(1 / 30, 0); });
  const pos = new Spring(0, { stiffness: 120, damping: 19 });
  const lift = new Spring(0, { stiffness: 140, damping: 17 });
  let focus = 0, opened = -1, swapT = 0, coloursRead = false;
  const N = cases.length;

  // Playing a case: it comes forward and steps aside, its record pops out of the open side on a spring,
  // and once the record is seated the turntable motor takes it (a torque up to 45 rpm; let go, it coasts
  // down on bearing friction) while the screen comes on with the video. Stopping runs it the other way:
  // the screen goes off, the record slides home, and only then does the case go back to the shelf.
  const scr = $('.screen', pv)!;
  const tube = $('.tube', scr)!;
  const vid = $<HTMLVideoElement>('video', scr)!;
  const seekEl = $('.seek', scr)!;
  const tNow = $('.time b', scr)!, tAll = $('.time span', scr)!;
  const stat = $<HTMLCanvasElement>('canvas.static', scr)!;
  const statX = stat.getContext('2d');
  interface Disc { el: HTMLElement; vinyl: HTMLElement; out: Spring; ang: number; w: number; seated: boolean }
  const discs: Disc[] = cases.map((c) => ({ el: $('.disc', c)!, vinyl: $('.vinyl', c)!, out: new Spring(0, { stiffness: 190, damping: 12 }), ang: Math.random() * 360, w: 0, seated: false }));
  const tv = new Spring(0, { stiffness: 230, damping: 19 });
  const RPM45 = 270; // degrees a second
  let held = -1, paused = false, statT = 0;
  // seeking: the play head is a spring chasing the spot you picked, and the picture follows it frame by
  // frame (a tape winding, not a cut), with the record turning along with it, backwards if need be
  const head = new Spring(0, { stiffness: 60, damping: 15.5 });
  let seeking = false, scrub: number | null = null, shownT = -1;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function seekTo(t: number) {
    if (!vid.duration || opened < 0) return;
    if (!seeking) {
      seeking = true;
      head.value = vid.currentTime;
      head.velocity = 0;
      vid.pause();
      scr.classList.add('seeking');
    }
    // only as far as the file can be wound (a host without byte ranges only allows what has arrived)
    const sk = vid.seekable, end = sk.length ? sk.end(sk.length - 1) : 0;
    head.target = Math.max(0, Math.min(vid.duration - 0.05, end, t));
  }
  const fracAt = (e: PointerEvent) => { const r = seekEl.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  seekEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!vid.duration || e.button !== 0) return;
    seekEl.setPointerCapture(e.pointerId);
    scrub = e.pointerId;
    scr.classList.add('scrub');
    sound('tick');
    seekTo(fracAt(e) * vid.duration);
  });
  seekEl.addEventListener('pointermove', (e) => { if (scrub === e.pointerId) seekTo(fracAt(e) * vid.duration); });
  const unscrub = (e: PointerEvent) => { if (scrub === e.pointerId) { scrub = null; scr.classList.remove('scrub'); } };
  seekEl.addEventListener('pointerup', unscrub);
  seekEl.addEventListener('pointercancel', unscrub);
  seekEl.addEventListener('click', (e) => e.stopPropagation());
  seekEl.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    seekTo((seeking ? head.target : vid.currentTime) + d);
  });
  function endSeek() {
    seeking = false;
    scrub = null;
    scr.classList.remove('seeking', 'scrub');
  }

  function setInfo() {
    info.classList.add('swap');
    clearTimeout(swapT);
    swapT = window.setTimeout(() => {
      infos.forEach((el, i) => (el.hidden = i !== focus));
      meas = null;
      ticks.forEach((b, i) => b.classList.toggle('on', i === focus));
      void info.offsetWidth;
      info.classList.remove('swap');
    }, reduce ? 0 : 110);
  }
  function setFocus(i: number, quiet = false) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === focus && !quiet) return;
    if (opened >= 0) setOpen(-1, true);
    if (!quiet) sound('clack', 0, Math.random());
    focus = i;
    pos.target = i;
    setInfo();
  }
  const soundOn = () => html.dataset.sound === 'on';
  function setOpen(i: number, quiet = false) {
    if (opened >= 0) {
      cases[opened].classList.remove('open');
      vid.pause();
    }
    opened = i;
    paused = false;
    endSeek();
    shownT = -1;
    scr.classList.remove('held');
    if (i >= 0) {
      cases[i].classList.add('open');
      const url = cases[i].dataset.video;
      if (url) {
        scr.dataset.src = '';
        if (vid.getAttribute('src') !== url) vid.src = url;
        vid.currentTime = 0;
        // started and stopped inside the tap, so the browser lets it play (with sound) once the record is seated
        vid.muted = !soundOn();
        vid.play().catch(() => {});
        vid.pause();
      } else delete scr.dataset.src;
      if (!quiet) sound('play');
    } else if (!quiet) sound('stop');
  }
  function hold(on = !paused) {
    if (opened < 0 || !discs[opened].seated) return;
    paused = on;
    scr.classList.toggle('held', on);
    if (scr.dataset.src !== undefined && !seeking) { if (on) vid.pause(); else { vid.muted = !soundOn(); vid.play().catch(() => {}); } }
    sound(on ? 'stop' : 'needle');
  }
  scr.addEventListener('click', (e) => { if (!(e.target as Element).closest('.ctl')) hold(); });

  // While a case plays, the screen takes the middle of the page and the project's name, links and blurb
  // ride down below it (the name a size smaller); stopping springs them all back. Both move on `lift`.
  const NAME_K = 0.62; // the name's scale while playing
  let meas: { top: number; h: number; nh: number } | null = null;
  const measure = () => {
    const nm = $<HTMLElement>('.pinfo:not([hidden]) .nm', info);
    return (meas ??= { top: info.offsetTop, h: info.offsetHeight, nh: nm ? nm.offsetHeight : 0 });
  };
  addEventListener('resize', () => (meas = null));
  /** Where the screen, the played case and the details stand. The screen is centred on the page (nudged up only
   *  if the details wouldn't fit under it), with the case and its record beside its bottom-right corner; on a
   *  narrow screen the case sits above it instead. */
  function stage(cs: number) {
    const W = pv.clientWidth, Hv = pv.clientHeight, m = measure();
    const R = 16 / 9, AW = 1.57, gap = 22, edge = W < 560 ? 52 : 44;
    const infoH = m.h - m.nh * (1 - NAME_K);
    let sw = Math.min(1280, W >= 560 ? W * 0.66 : W - 32), sh = sw / R;
    const side = Math.max(20, cs * 0.08);
    let k = Math.min(0.46, ((W - sw) / 2 - side - 24) / (AW * cs));
    const stacked = k < 0.28;
    if (stacked) k = 0.42;
    const above = stacked ? cs * k + 14 : 0; // the case, when it sits on top
    const fit = Hv - 2 * edge - above - gap - infoH; // the tallest screen that leaves room for everything
    if (sh > fit) { sh = Math.max(fit, 120); sw = sh * R; }
    // centre the screen; if the details would run off the bottom, lift the whole group just enough
    let top = (Hv - sh) / 2;
    top = Math.max(edge + above, Math.min(top, Hv - edge - infoH - gap - sh));
    const sy = top + sh / 2, infoY = top + sh + gap;
    return stacked
      ? { sw, sh, sx: 0, sy, k, cx: (-AW * cs * k) / 2 + 0.5 * cs * k, cy: top - 14 - (cs * k) / 2, dy: infoY - m.top }
      : { sw, sh, sx: 0, sy, k, cx: sw / 2 + side + 0.5 * cs * k, cy: top + sh - (cs * k) / 2, dy: infoY - m.top };
  }
  function layout() {
    if (!N) return;
    // everything measured first, before anything is moved: a measurement taken after a case has been moved
    // makes the browser work out the page's styles again, once per case, every frame
    const cs = cases[0].offsetWidth, PW = pv.clientWidth, G = cs * 0.98, St = cs * 0.2, o2 = lift.value;
    const S = held >= 0 || tv.value > 0.001 ? stage(cs) : null, cy0 = cases[0].offsetTop + cs / 2;
    cases.forEach((c, i) => {
      const o = i - pos.value, a = Math.abs(o), sg = Math.sign(o);
      let x = a < 1 ? o * G : sg * (G + (a - 1) * St);
      let ry = a < 1 ? -14 * (1 - a) - sg * 74 * a : -sg * 74;
      let z = -Math.min(a, 1) * cs * 0.55 - Math.max(0, a - 1) * 6, y = 0, k = 1;
      if (i === held && S) {
        // lifted off the shelf (towards you at mid-move, as a hand would carry it) and set down beside the screen
        x += (S.cx - x) * o2;
        y += (S.cy - cy0) * o2;
        ry += (-10 - ry) * o2;
        z = z * (1 - o2) + Math.sin(Math.min(1, Math.max(0, o2)) * Math.PI) * cs * 0.35;
        k = 1 + (S.k - 1) * o2;
      } else {
        // the rest of the shelf clears the stage: slid out past the edges of the page, so while something plays
        // no other case sits beside the screen, half-lit or crowding its neighbours, and they all slide back in
        // on the same spring when it stops. (Pushed back too, so they leave along the shelf's own perspective.)
        const side = i < held ? -1 : i > held ? 1 : sg;
        x += side * o2 * (PW * 0.75 + cs * 1.6);
        z -= o2 * cs * 0.8;
      }
      // once a case is fully off the page it isn't drawn at all
      const gone = i !== held && held >= 0 && o2 > 0.97;
      if (c.style.visibility !== (gone ? 'hidden' : '')) c.style.visibility = gone ? 'hidden' : '';
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) scale3d(${k.toFixed(4)}, ${k.toFixed(4)}, ${k.toFixed(4)})`;
      c.style.zIndex = String(i === held ? 120 : 100 - Math.round(a * 10));
      c.style.setProperty('--shade', Math.min(0.6, a * 0.22).toFixed(3));
    });
    discs.forEach((d, i) => {
      // a record is only drawn while it is (or is coming) out of its case; at rest inside it there is nothing to
      // see, and a hidden record can't show through a neighbour's faces when the browser sorts the planes
      const out = i === held && (d.out.value > 0.002 || d.out.target > 0);
      if (d.el.hidden !== !out) d.el.hidden = !out;
      if (!out) { if (d.el.style.transform) { d.el.style.transform = ''; d.vinyl.style.transform = ''; } return; }
      // straight out of the open side and straight back in, flat in the case's middle plane: the case is only
      // 8.5% of its width deep, so any tilt would push the record through the front or back face
      d.el.style.transform = `translate3d(${(d.out.value * 0.62 * cs).toFixed(1)}px, 0, 0)`;
      // and only the part that has cleared the case is drawn: the rest is cut off at the case's open side, so
      // the record can never show in front of the cover, however the graphics card orders the two layers
      const tx = Math.max(0, d.out.value) * 0.62 * cs, hid = Math.max(0, 0.96 * cs - tx); // the record starts 4% in from the case's left edge
      d.el.style.clipPath = `inset(0 0 0 ${hid.toFixed(1)}px)`;
      d.vinyl.style.transform = `rotate(${d.ang.toFixed(2)}deg)`;
    });
    // the details ride down under the screen, the name shrinking as they go
    const oi = S ? Math.max(-0.1, Math.min(1.1, o2)) : 0;
    info.style.setProperty('--o', oi.toFixed(4));
    info.style.setProperty('--nh', `${measure().nh}px`);
    info.style.transform = S && oi ? `translateY(${(S.dy * oi).toFixed(1)}px)` : '';
    floor.style.opacity = (1 - Math.max(0, Math.min(1, o2))).toFixed(3);
    if (!S) return;
    // the screen: a tube warming up. A line first (wide, one pixel tall, bright), then the picture opens out of it
    const v = Math.max(0, tv.value);
    scr.hidden = v < 0.002 && tv.target === 0;
    if (scr.hidden) return;
    const sx = Math.min(1, v * 2.4), sy = Math.max(1.5 / S.sh, Math.min(1.08, (v - 0.3) / 0.7));
    scr.style.width = `${S.sw.toFixed(1)}px`;
    scr.style.height = `${S.sh.toFixed(1)}px`;
    scr.style.transform = `translate(${(PW / 2 + S.sx - S.sw / 2).toFixed(1)}px, ${(S.sy - S.sh / 2).toFixed(1)}px)`;
    tube.style.transform = `scale(${Math.max(0.02, sx).toFixed(4)}, ${sy.toFixed(4)})`;
    scr.style.setProperty('--flash', Math.max(0, 1 - Math.abs(v - 0.32) * 3.2).toFixed(3));
    scr.style.setProperty('--on', Math.min(1, Math.max(0, (v - 0.6) / 0.4)).toFixed(3));
  }
  /** The playing record, the turntable and the screen, a frame at a time. */
  function deck(dt: number) {
    if (held >= 0 && held !== opened) {
      // the record goes home before the case does, and the case is back on the shelf before another comes out
      if (discs[held].out.value < 0.3) lift.target = 0;
      if (lift.target === 0 && Math.abs(lift.value) < 0.004 && Math.abs(lift.velocity) < 0.02 && discs[held].out.value < 0.01) held = opened;
    } else {
      held = opened;
      lift.target = opened >= 0 ? 1 : 0;
    }
    if (seeking) {
      if (reduce) { head.value = head.target; head.velocity = 0; } else head.step(dt);
      // the picture follows the head as fast as the decoder can show it
      if (!vid.seeking && Math.abs(vid.currentTime - head.value) > 1 / 40) vid.currentTime = head.value;
      if (scrub === null && Math.abs(head.value - head.target) < 0.015 && Math.abs(head.velocity) < 0.08) {
        vid.currentTime = head.target;
        endSeek();
        if (!paused) { vid.muted = !soundOn(); vid.play().catch(() => {}); }
      }
    }
    discs.forEach((d, i) => {
      const want = i === opened && i === held && lift.value > 0.55 ? 1 : 0;
      if (want && !d.out.target) sound('eject', panOf(rectOf(cases[i])) * 0.6);
      d.out.target = want;
      if (reduce) { d.out.value = want; d.out.velocity = 0; } else d.out.step(dt);
      if (!d.seated && i === opened && d.out.value > 0.86) {
        // the record is on the spindle: motor on, the stylus down, the screen comes up
        d.seated = true;
        tv.target = 1;
        if (!reduce) sound('needle');
        if (scr.dataset.src !== undefined) { vid.muted = !soundOn(); vid.play().catch(() => {}); }
      }
      if (d.seated && (i !== opened || d.out.value < 0.5)) d.seated = false;
      const motor = d.seated && !paused && !reduce;
      // drive torque eases it up to speed; without it the bearings and the air bring it down. While the
      // video winds, the platter is locked to the picture: it turns as fast (and whichever way) the head moves.
      if (seeking && i === opened && !reduce) d.w = head.velocity * RPM45;
      else if (motor) d.w += (RPM45 - d.w) * (1 - Math.exp(-2.6 * dt));
      else if (d.w) { const f = (55 + 0.45 * d.w) * dt; d.w = d.w > f ? d.w - f : 0; }
      d.ang = (d.ang + d.w * dt) % 360;
    });
    if (opened < 0 || !discs[opened].seated) tv.target = 0;
    if (reduce) { tv.value = tv.target; tv.velocity = 0; } else tv.step(dt);
    if (scr.dataset.src !== undefined) {
      vid.muted = !soundOn();
      if (vid.duration) {
        const t = seeking ? head.value : vid.currentTime;
        seekEl.style.setProperty('--p', (t / vid.duration).toFixed(4));
        if (Math.floor(t) !== shownT) {
          shownT = Math.floor(t);
          tNow.textContent = fmt(t);
          tAll.textContent = fmt(vid.duration);
          seekEl.setAttribute('aria-valuenow', String(Math.round((t / vid.duration) * 100)));
        }
      }
    } else if (statX && tv.value > 0.01 && (statT -= dt) <= 0) {
      // no signal: snow, at the rate an old set redraws it
      statT = 1 / 24;
      const img = statX.createImageData(96, 54), p = img.data;
      for (let q = 0; q < p.length; q += 4) { const n = Math.random() * 255; p[q] = p[q + 1] = p[q + 2] = n; p[q + 3] = 255; }
      statX.putImageData(img, 0, 0);
    }
  }

  // the wheel: one notch, one case
  let wheelAcc = 0, wheelAt = 0;
  pv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const now = performance.now();
    if (now - wheelAt > 260) wheelAcc = 0;
    wheelAt = now;
    wheelAcc += e.deltaMode === 1 ? d * 40 : d;
    if (Math.abs(wheelAcc) >= 40) { setFocus(focus + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { passive: false });
  // drag or swipe; a tap on the front case plays it, a tap on another brings it forward
  let drag: { x: number; p: number; moved: boolean; vx: number; lx: number; lt: number; id: number } | null = null;
  shelf.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, p: pos.value, moved: false, vx: 0, lx: e.clientX, lt: performance.now(), id: e.pointerId };
  });
  shelf.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      shelf.setPointerCapture(e.pointerId);
      shelf.classList.add('drag');
      if (opened >= 0) setOpen(-1, true);
    }
    if (!drag.moved) return;
    const cs = cases[0].offsetWidth, now = performance.now();
    drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
    drag.lx = e.clientX;
    drag.lt = now;
    pos.value = pos.target = Math.max(-0.4, Math.min(N - 0.6, drag.p - dx / (cs * 0.55)));
    pos.velocity = 0;
    const near = Math.round(pos.value);
    if (near !== focus && near >= 0 && near < N) { focus = near; sound('clack', 0, Math.random()); setInfo(); }
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    shelf.classList.remove('drag');
    if (drag.moved) {
      const cs = cases[0].offsetWidth;
      setFocus(Math.round(pos.value - (drag.vx * 120) / (cs * 0.55)), true);
    } else if (e.type === 'pointerup') {
      const c = (e.target as Element).closest<HTMLElement>('.case');
      if (c) {
        const i = Number(c.dataset.i);
        // a tap on the turning record holds it (and the video), like a finger on the label
        if (i === opened && (e.target as Element).closest('.disc')) hold();
        else if (i === focus) setOpen(opened === i ? -1 : i);
        else setFocus(i);
      }
    }
    drag = null;
  };
  shelf.addEventListener('pointerup', endDrag);
  shelf.addEventListener('pointercancel', endDrag);
  ticks.forEach((b, i) => b.addEventListener('click', () => setFocus(i)));
  addEventListener('keydown', (e) => {
    if (current !== 'projects' || (e.target as Element).closest('a, button, .seek')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setFocus(focus + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(focus - 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(opened === focus ? -1 : focus); }
  });

  const projects: Hooks = {
    enter() {
      if (!coloursRead) { coloursRead = true; recolour(); }
      setFocus(0, true);
      pos.value = reduce ? 0 : -2.5;
      pos.velocity = 0;
      lift.value = lift.target = 0;
      lift.velocity = 0;
      held = -1;
      discs.forEach((d) => { d.out.value = d.out.target = d.out.velocity = 0; d.w = 0; d.seated = false; });
      tv.value = tv.target = tv.velocity = 0;
      scr.hidden = true;
      if (reduce) layout();
    },
    leave() { if (opened >= 0) setOpen(-1, true); },
    frame(dt) {
      deck(dt);
      if (reduce) { pos.value = pos.target; lift.value = lift.target; }
      else { pos.step(dt); lift.step(dt); }
      layout();
      if (!reduce && !pv.classList.contains('exit')) covers.forEach((s, i) => { if (Math.abs(i - pos.value) < 3.5) s.draw(dt, i === opened ? 1 : i === focus ? 0.25 : 0); });
    },
  };

  // ======================================================================== CONTRIBUTIONS: every year
  const cv = view('contributions');
  const cal = $('[data-cal]', cv)!;
  const tip = $('.heat-tip', cv)!;
  const tz = home.dataset.tz || 'Asia/Shanghai';
  let loaded: 'no' | 'loading' | 'yes' = 'no';
  interface Year { year: number; total: number; start: string; counts: number[]; levels: string }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = 864e5;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const longDate = (d: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const countText = (n: number) => (n === 0 ? 'No contributions' : n === 1 ? '1 contribution' : `${n.toLocaleString('en-US')} contributions`);
  type Cell = { date: string; n: number; l: number } | null;

  /** A year laid out GitHub-style: columns are weeks (Sunday at the top), cells before Jan 1 or after today left empty. */
  function cellsOf(Y: Year, today: string, cols: number): Cell[] {
    const jan1 = Date.UTC(Y.year, 0, 1), pad = new Date(jan1).getUTCDay();
    const first = Math.round((Date.parse(`${Y.start}T00:00:00Z`) - jan1) / DAY);
    const out: Cell[] = new Array(cols * 7).fill(null);
    Y.counts.forEach((n, k) => {
      const at = pad + first + k, date = iso(jan1 + (first + k) * DAY);
      if (at < out.length && date <= today) out[at] = { date, n, l: Number(Y.levels[k]) || 0 };
    });
    return out;
  }
  const monthCols = (year: number) => {
    const jan1 = Date.UTC(year, 0, 1), pad = new Date(jan1).getUTCDay();
    return MON.map((_, m) => Math.floor((pad + (Date.UTC(year, m, 1) - jan1) / DAY) / 7));
  };
  const cellHtml = (c: Cell) => (c ? `<i class="l${c.l}" data-level="${c.l}" data-n="${c.n}" data-on="${c.date}"></i>` : '<i class="gap"></i>');

  let years: Year[] = [], grids: Cell[][] = [];
  function vertical(i: number) {
    const Y = years[i], g = grids[i], rows: string[] = [];
    const mc = monthCols(Y.year);
    for (let w = 0; w < g.length / 7; w++) {
      const wk = g.slice(w * 7, w * 7 + 7);
      if (wk.every((c) => !c) && w > 0) continue; // no empty weeks after today on the current year
      const m = mc.indexOf(w);
      rows.push(`<span>${m >= 0 ? MON[m] : ''}</span>${wk.map(cellHtml).join('')}`);
    }
    return `<div class="vhead"><b>${Y.year}</b><span><b>${Y.total.toLocaleString('en-US')}</b></span></div><div class="vg${reduce ? '' : ' slide'}">${rows.join('')}</div>`;
  }
  function render(list: Year[]) {
    years = [...list].sort((a, b) => b.year - a.year);
    if (!years.length) { $('[data-cal-empty]', cv)!.hidden = false; return; }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const cols = Math.max(53, ...years.map((Y) => Math.ceil((new Date(Date.UTC(Y.year, 0, 1)).getUTCDay() + Y.counts.length + Math.round((Date.parse(`${Y.start}T00:00:00Z`) - Date.UTC(Y.year, 0, 1)) / DAY)) / 7)));
    grids = years.map((Y) => cellsOf(Y, today, cols));
    // the stats
    const days = grids.slice().reverse().flat().filter((c): c is NonNullable<Cell> => !!c);
    let run = 0, best = 0, prev = 0, busiest = { n: 0, date: '' };
    for (const d of days) {
      const t = Date.parse(`${d.date}T00:00:00Z`);
      run = !d.n ? 0 : run && t - prev === DAY ? run + 1 : 1; // a gap in the data breaks a streak too
      prev = t;
      best = Math.max(best, run);
      if (d.n > busiest.n) busiest = { n: d.n, date: d.date };
    }
    const bestYear = years.reduce((m, Y) => (Y.total > m.total ? Y : m), years[0]);
    const set = (k: string, v: string, tipText?: string) => { const el = $(`[data-stat="${k}"]`, cv)!; el.textContent = v; if (tipText) el.title = tipText; };
    set('total', years.reduce((a, Y) => a + Y.total, 0).toLocaleString('en-US'));
    set('best', String(bestYear.year), `${bestYear.total.toLocaleString('en-US')} contributions`);
    set('streak', `${best} ${best === 1 ? 'day' : 'days'}`);
    set('busiest', busiest.n.toLocaleString('en-US'), busiest.date ? longDate(busiest.date) : undefined);
    // the month row follows this year's weeks, the top row
    const mc = monthCols(years[0].year), head = new Array(cols).fill('');
    mc.forEach((c, m) => (head[c] = MON[m]));
    cal.innerHTML =
      `<div class="mos" data-s style="--d:2;--cols:${cols}"><span></span><div>${head.map((m) => `<span>${m}</span>`).join('')}</div><span></span></div>` +
      `<div class="years">${years.map((Y, r) => `<div class="yr${r === 0 ? ' now' : ''}" data-s style="--d:${Math.min(r + 2, 12)};--row:${Math.min(r, 8)};--cols:${cols}"><span class="y">${Y.year}</span><div class="g">${grids[r].map(cellHtml).join('')}</div><span class="tot"><b>${Y.total.toLocaleString('en-US')}</b></span></div>`).join('')}</div>` +
      `<div class="vyear"><div class="ychips" data-s style="--d:2">${years.map((Y, i) => `<button type="button" data-y="${i}" aria-pressed="${i === 0}">${Y.year}</button>`).join('')}</div><div class="vbox" data-s style="--d:3">${vertical(0)}</div></div>`;
  }
  async function load(retry = true) {
    if (loaded !== 'no') return;
    loaded = 'loading';
    try {
      const r = await fetch('/api/years');
      if (r.status === 404 && retry) { loaded = 'no'; setTimeout(() => load(false), 4000); return; } // the first fetch from GitHub is still running
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { years: Year[] };
      loaded = 'yes';
      render(j.years);
    } catch {
      loaded = 'no';
      if (!years.length) $('[data-cal-empty]', cv)!.hidden = false;
    }
  }
  cv.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-y]');
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    $$('[data-y]', cv).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('.vbox', cv)!.innerHTML = vertical(Number(b.dataset.y));
    sound('roll');
  });
  let tipOn: HTMLElement | null = null;
  const showTip = (c: HTMLElement | null) => {
    tipOn?.classList.remove('on');
    tipOn = c;
    if (!c) { tip.hidden = true; return; }
    c.classList.add('on');
    tip.querySelector('b')!.textContent = countText(Number(c.dataset.n));
    tip.querySelector('span')!.textContent = `on ${longDate(c.dataset.on!)}`;
    tip.hidden = false;
    const b = cv.getBoundingClientRect(), r = c.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(b.width - w - 8, r.left - b.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.top - b.top + cv.scrollTop - h - 6}px`;
  };
  cv.addEventListener('pointerover', (e) => showTip((e.target as Element).closest<HTMLElement>('i[data-n]')));
  cv.addEventListener('pointerleave', () => showTip(null));
  cv.addEventListener('scroll', () => tipOn && showTip(null), { passive: true });

  // ======================================================================== MILESTONES: the year held at the left
  const mv = view('milestones');
  const roll = $('.bigyear', mv);
  const tl = $('.tl2', mv), fill = $('.fill', mv);
  const firstYear = $('.yh', mv)?.dataset.year ?? '';
  let shownYear = firstYear;
  function rollTo(y: string, quiet = false) {
    if (!roll || y === shownYear) return;
    shownYear = y;
    const old = $('.roll:not(.out)', roll);
    const nu = document.createElement('span');
    nu.className = 'roll in';
    nu.textContent = y;
    roll.appendChild(nu);
    if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 700); }
    void nu.offsetWidth;
    nu.classList.remove('in');
    if (!quiet) sound('roll');
  }
  function track() {
    if (!tl || !fill) return;
    const line = mv.getBoundingClientRect().top + mv.clientHeight * 0.35;
    let y = firstYear;
    for (const li of $$('li', tl)) if (li.getBoundingClientRect().top < line) y = li.dataset.year ?? y;
    rollTo(y);
    const r = tl.getBoundingClientRect(), lastM = $$('li.m', tl).pop()?.getBoundingClientRect();
    fill.style.height = `${Math.max(0, Math.min((lastM ? lastM.top - r.top + 14 : 0), line - r.top))}px`;
  }
  mv.addEventListener('scroll', track, { passive: true });
  const milestones: Hooks = {
    enter() {
      if (roll) { roll.innerHTML = `<span class="roll">${firstYear}</span>`; shownYear = firstYear; }
      if (fill) fill.style.height = '0px';
    },
  };

  const hooks: Record<Name, Hooks> = { projects, contributions: { enter: () => void load() }, milestones, loadout: {} };

  // ---------- a visit that starts on a page's address opens it straight away
  const first = nameOf(location.pathname);
  if (first) open(first, null, true);
}
