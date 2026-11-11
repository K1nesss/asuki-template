// Everything that moves in the browser: clock, sky and weather, the side waves, the banner's pilot and
// mech, the footer pet and her prop, the counters, and the theme and sound switches.
import persona from '@persona';
import { clock, localMinutes, phaseAt, PHASE_LABEL } from '../lib/sky';
import { mountBanner } from './banner';
import { mountPet } from './pet';
import { mountPlayer } from './player';
import { mountAvatar } from './avatar';
import { mountGlows } from './glow';
import { mountPages } from './pages';
import { mountPeeks } from './peek';
import { mountMarks } from './marks';
import { press } from './spring';
import { mountProp } from './prop';
import { mountWaves } from './waves';
import { mountWeather } from './weather';
import { sound, unlockAudio, type Cue } from './sound';
import { THEME_MS, wipeTimeAt, startWipe, endWipe, type Wipe } from './paint';

const page = document.getElementById('page')!;
const tz = page.dataset.tz || 'UTC';
const hero = document.getElementById('hero');

// ---------- clock and sky phase, every 15 seconds
function tick() {
  const now = new Date();
  document.querySelectorAll('[data-clock]').forEach((el) => (el.textContent = clock(tz, now)));
  const phase = phaseAt(localMinutes(tz, now), page.dataset.sunrise, page.dataset.sunset);
  if (hero && hero.dataset.phase !== phase) hero.dataset.phase = phase;
  document.querySelectorAll('[data-phase-word]').forEach((el) => (el.textContent = PHASE_LABEL[phase]));
}
tick();
setInterval(tick, 15_000);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- theme
const themeBtn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const syncThemeBtn = () => {
  const light = document.documentElement.dataset.theme === 'light';
  themeBtn?.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
};
syncThemeBtn();
function applyTheme(next: 'light' | 'dark', quiet = false) {
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(`${persona.storageKey}-theme`, next); } catch {}
  syncThemeBtn();
  if (!quiet) themeChanged();
}
// the canvases (sea, cards, player) read their colours again
const themeChanged = () => window.dispatchEvent(new Event('site:theme'));
// The new theme spreads out from the switch as a growing circle where the browser can do it
// (View Transitions); elsewhere the colours cross-fade. Instant for visitors who prefer less motion.
themeBtn?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (reduce) return applyTheme(next);
  if (!doc.startViewTransition) {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    applyTheme(next);
    setTimeout(() => root.classList.remove('theme-fade'), 500);
    return;
  }
  // a second click while the circle is still growing would cut it off and jump; it waits its turn instead
  if (switching) return;
  switching = true;
  const r = themeBtn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement;
  // the new theme starts as a dot at the switch (site.css reads these), so the frame or two before the
  // animation begins can't show the whole new page at once, which is what made the switch flicker
  root.style.setProperty('--vt-x', `${x}px`);
  root.style.setProperty('--vt-y', `${y}px`);
  root.style.setProperty('--vt-r', `${Math.ceil(end)}px`);
  const held = holdLiveFrames(x, y, end);
  const lifted = liftLive();
  // the canvases that stay live keep their old colours outside the circle and draw its edge themselves
  const wipe: Wipe = { x, y, end, anim: null, t0: 0 };
  startWipe(wipe);
  // Only the attribute changes inside the switch: the browser holds the screen still while that callback
  // runs, so the canvases repaint just after, in the new layer, instead of stalling the start of the circle.
  // The circle itself is a CSS animation (site.css), run by the compositor like Glyph's wipe, so it stays
  // smooth however busy the page is.
  const vt = doc.startViewTransition(() => applyTheme(next, true)) as { ready: Promise<void>; finished?: Promise<void> };
  vt.ready.then(() => {
    // the canvases follow the browser's own circle, frame for frame (or the clock, if it can't be found)
    wipe.t0 = performance.now();
    wipe.anim = root.getAnimations({ subtree: true })
      .find((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === '::view-transition-new(root)') ?? null;
    requestAnimationFrame(themeChanged);
    held.forEach((h) => h.release());
  }).catch(() => { endWipe(); themeChanged(); held.forEach((h) => h.release(true)); });
  const done = () => {
    switching = false;
    endWipe();
    lifted();
    ['--vt-x', '--vt-y', '--vt-r'].forEach((v) => root.style.removeProperty(v));
  };
  (vt.finished ?? vt.ready).then(done, done);
});
let switching = false;

// A View Transition shows the old page as a still picture until the circle reaches it, so everything that
// moves is lifted out of that picture and shown live: the banner, the yard and the ticker always (site.css),
// the sea and the project screens while they run (named here). Those look alike in both themes or draw
// the circle themselves (waves.ts, glow.ts), so nothing stops moving while the theme changes.
function liftLive() {
  const els: HTMLElement[] = [];
  const sea = document.getElementById('waves');
  if (sea?.dataset.running !== undefined) els.push(sea);
  document.querySelectorAll<HTMLElement>('.glow-fx').forEach((c) => {
    const b = c.getBoundingClientRect();
    if (b.width && b.bottom > 0 && b.top < innerHeight) els.push(c);
  });
  els.forEach((el, i) => {
    el.style.setProperty('view-transition-name', `live-${i}`);
    el.style.setProperty('view-transition-class', 'live');
  });
  return () => els.forEach((el) => { el.style.removeProperty('view-transition-name'); el.style.removeProperty('view-transition-class'); });
}

// The banner and the pet yard are shown live through the switch (site.css), so their frames and the
// yard's tape would take the new colours at once, before the circle gets there. Each is held in the old
// colours until the circle's edge reaches it, then changes while the edge sweeps across it.
const HELD_VARS = ['--line', '--orange', '--bg'];
function holdLiveFrames(x: number, y: number, end: number) {
  return [...document.querySelectorAll<HTMLElement>('.hero, .yard')].map((el) => {
    const cs = getComputedStyle(el);
    HELD_VARS.forEach((v) => el.style.setProperty(v, cs.getPropertyValue(v)));
    const b = el.getBoundingClientRect();
    const near = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
    const far = Math.hypot(Math.max(x - b.left, b.right - x), Math.max(y - b.top, b.bottom - y));
    const from = wipeTimeAt(near / end) * THEME_MS, to = wipeTimeAt(far / end) * THEME_MS;
    const let_go = () => {
      el.style.setProperty('--frame-t', `${Math.max(0, Math.round(to - from))}ms`);
      HELD_VARS.forEach((v) => el.style.removeProperty(v));
      window.setTimeout(() => el.style.removeProperty('--frame-t'), to - from + 50);
    };
    return { release: (now = false) => (now ? let_go() : window.setTimeout(let_go, from)) };
  });
}

// ---------- sound: on by default; the speaker switch mutes everything, the music player included
const soundBtns = document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]');
const syncSound = () => {
  const on = document.documentElement.dataset.sound === 'on';
  soundBtns.forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on'); });
  document.querySelectorAll('[data-sound-word]').forEach((el) => (el.textContent = on ? 'on' : 'off'));
  document.querySelectorAll<HTMLMediaElement>('audio').forEach((a) => (a.muted = !on));
};
syncSound();
soundBtns.forEach((b) =>
  b.addEventListener('click', () => {
    const on = document.documentElement.dataset.sound !== 'on';
    if (on) document.documentElement.dataset.sound = 'on';
    else delete document.documentElement.dataset.sound;
    try { localStorage.setItem(`${persona.storageKey}-sound`, on ? 'on' : 'off'); } catch {}
    syncSound();
    if (on) sound('boot');
  }),
);
// ---------- the sea switch: holds the waves in the margins still (remembered), or sets them going again
const seaBtn = document.querySelector<HTMLButtonElement>('[data-waves-toggle]');
const syncSea = () => {
  const still = document.documentElement.dataset.waves === 'still';
  seaBtn?.setAttribute('aria-pressed', String(still));
  seaBtn?.setAttribute('aria-label', still ? 'Set the sea moving' : 'Hold the sea still');
};
syncSea();
seaBtn?.addEventListener('click', () => {
  const still = document.documentElement.dataset.waves !== 'still';
  if (still) document.documentElement.dataset.waves = 'still';
  else delete document.documentElement.dataset.waves;
  try { localStorage.setItem(`${persona.storageKey}-waves`, still ? 'still' : 'moving'); } catch {}
  syncSea();
  dispatchEvent(new Event('site:waves'));
});

// browsers hold audio back until the first click or key press
const unlock = () => { unlockAudio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// ---------- phone menu
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const menu = document.getElementById('menu');
menuBtn?.addEventListener('click', () => {
  const open = !menu?.classList.contains('open');
  menu?.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
});
menu?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) {
    menu.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded', 'false');
  }
});

// ---------- counters
const setCount = (sel: string, n: number) => document.querySelectorAll(sel).forEach((el) => (el.textContent = String(n)));
try {
  if (!sessionStorage.getItem(`${persona.storageKey}-visit`)) {
    sessionStorage.setItem(`${persona.storageKey}-visit`, '1');
    fetch('/api/visit', { method: 'POST', keepalive: true })
      .then((r) => (r.ok ? (r.json() as Promise<{ visits?: number }>) : null))
      .then((j: { visits?: number } | null) => j?.visits && setCount('[data-visits]', j.visits))
      .catch(() => {});
  }
} catch {}

// the heart in the footer is grey, and lights up red while she is being petted
let litTimer = 0;
function lightHeart() {
  document.querySelectorAll('.legal .pets').forEach((el) => el.classList.add('lit'));
  clearTimeout(litTimer);
  litTimer = window.setTimeout(() => document.querySelectorAll('.legal .pets').forEach((el) => el.classList.remove('lit')), 1600);
}

let pending = 0;
let petTimer = 0;
let shown = Number(document.querySelector('[data-pets]')?.textContent || 0);
function countPet() {
  lightHeart();
  pending++;
  setCount('[data-pets]', ++shown);
  if (petTimer) return;
  petTimer = window.setTimeout(async () => {
    const n = Math.min(pending, 5);
    pending = 0;
    petTimer = 0;
    try {
      const r = await fetch('/api/pet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n }) });
      if (r.ok) {
        const j = (await r.json()) as { pets: number };
        if (j.pets > shown) setCount('[data-pets]', (shown = j.pets));
      }
    } catch {}
  }, 1000);
}

// ---------- contribution heatmap: a note over the square under the pointer (or the one tapped)
const weeksEl = document.querySelector<HTMLElement>('.weeks');
const heatTip = document.querySelector<HTMLElement>('.heat-tip');
if (weeksEl && heatTip) {
  const box = weeksEl.parentElement!;
  let on: HTMLElement | null = null;
  const show = (cell: HTMLElement | null) => {
    on?.classList.remove('on');
    on = cell;
    if (!cell) { heatTip.hidden = true; return; }
    cell.classList.add('on');
    heatTip.querySelector('b')!.textContent = cell.dataset.n ?? '';
    heatTip.querySelector('span')!.textContent = `on ${cell.dataset.on ?? ''}`;
    heatTip.hidden = false;
    const b = box.getBoundingClientRect(), c = cell.getBoundingClientRect();
    const w = heatTip.offsetWidth, h = heatTip.offsetHeight;
    heatTip.style.left = `${Math.max(4, Math.min(b.width - w - 4, c.left - b.left + c.width / 2 - w / 2))}px`;
    heatTip.style.top = `${c.top - b.top - h - 6}px`;
  };
  weeksEl.addEventListener('pointerover', (e) => show((e.target as HTMLElement).closest<HTMLElement>('i[data-n]')));
  weeksEl.addEventListener('pointerleave', () => show(null));
  window.addEventListener('scroll', () => on && show(null), { passive: true });
}

// ---------- the moving parts
if (hero) {
  mountBanner(hero, { reduce });
  mountWeather(hero, { reduce });
}
const yard = document.getElementById('yard');
if (yard) mountProp(yard, mountPet(yard, { reduce, onPet: countPet }), { reduce });
const canvas = document.getElementById('waves') as HTMLCanvasElement | null;
if (canvas) mountWaves(canvas, page, { reduce });

// ---------- the music player
const player = document.getElementById('player');
if (player) mountPlayer(player);

// ---------- the avatar turns over when clicked
const avatar = document.querySelector<HTMLElement>('[data-avatar]');
if (avatar?.querySelector('.back')) mountAvatar(avatar, reduce); // it turns over only when it has a back
const projects = document.querySelector<HTMLElement>('#projects');
if (projects) mountGlows(projects, reduce);

// ---------- the full pages behind the panels' orange corners
mountPages(reduce);
mountPeeks(reduce);
mountMarks(reduce);

// ---------- every control has its own voice: hover and press sounds differ by kind (see sound.ts),
// and pressing an icon squashes it on a spring
type Voice = { sel: string; hover?: Cue; press?: Cue; squash?: boolean };
const VOICES: Voice[] = [
  { sel: '[data-sound-toggle]', hover: 'tick', squash: true },
  { sel: '[data-waves-toggle]', hover: 'tick', press: 'switch', squash: true }, // it plays its own boot sound
  { sel: '[data-theme-toggle], .menu-btn', hover: 'tick', press: 'switch', squash: true },
  { sel: '.player .play', hover: 'tick', press: 'switch', squash: true },
  { sel: '.contact a.send', hover: 'beep', press: 'confirm', squash: true },
  { sel: '.contact a.iconbtn, .bio a.appmark, .card .links a, .card strong a, .miles a, .pinfo a, .tl2 a', hover: 'beep', press: 'latch', squash: true },
  { sel: '.more, .view .back', hover: 'tick' }, // opening and closing have their own sounds
  { sel: '.ticks button', hover: 'tick' },
  { sel: '.nav .iconbtn, .menu a, .legal a', hover: 'tick', press: 'relay', squash: true },
  { sel: '.card', hover: 'panel' },
  { sel: '.chips li, .tile', hover: 'tink' },
  { sel: '.weeks i[data-n], .cal i[data-n]', hover: 'data' },
  { sel: '.miles li, .tl2 li.m, .ychips button', hover: 'tick' },
  { sel: '[data-avatar]', hover: 'tick' }, // the flip has its own sound
];
const voiceOf = (t: EventTarget | null) => {
  const el = t instanceof Element ? t : null;
  if (!el) return null;
  for (const v of VOICES) { const hit = el.closest<HTMLElement>(v.sel); if (hit) return { v, el: hit }; }
  return null;
};
let lastHover = 0;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const hit = voiceOf(e.target);
  if (!hit?.v.hover || hit.el.contains(e.relatedTarget as Node)) return; // only on the way in
  const now = performance.now();
  if (now - lastHover < 45) return;
  lastHover = now;
  const pan = ((e.clientX / innerWidth) * 2 - 1) * 0.5;
  let amount = 1;
  if (hit.v.hover === 'tink') amount = [...hit.el.parentElement!.children].indexOf(hit.el) % 8; // up the row like keys
  if (hit.v.hover === 'data') amount = Number(hit.el.dataset.level || 0) / 4;
  sound(hit.v.hover, pan, amount);
});
document.addEventListener('click', (e) => {
  const hit = voiceOf(e.target);
  if (!hit) return;
  if (hit.v.press) sound(hit.v.press, ((e.clientX / innerWidth) * 2 - 1) * 0.5);
  if (hit.v.squash && !reduce) hit.el.querySelectorAll<SVGElement>('svg.ico, svg.brand').forEach((ico) => press(ico));
});
