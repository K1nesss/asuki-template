// The music player: play/pause, and a pixel waveform that is also the seek bar. The bars are the track's
// loudness; the part already played burns orange with a bright playhead, the rest is a dim scanline
// dither, and the pointer shows where a click would jump to. Drag to scrub; arrow keys step 5 s.

interface Track { src: string; title: string; artist: string; duration: number; peaks: string }

const BAR = 3, GAP = 1, PITCH = BAR + GAP;

export function mountPlayer(root: HTMLElement) {
  const track = JSON.parse(root.dataset.track || '{}') as Track;
  const audio = root.querySelector<HTMLAudioElement>('[data-audio]')!;
  const btn = root.querySelector<HTMLButtonElement>('[data-play]')!;
  const wave = root.querySelector<HTMLElement>('[data-wave]')!;
  const canvas = wave.querySelector('canvas')!;
  const elapsed = root.querySelector<HTMLElement>('[data-elapsed]')!;
  const g = canvas.getContext('2d')!;
  const peaks = [...track.peaks].map(Number);
  let W = 0, H = 0, cols: number[] = [], hover = -1, raf = 0, dragging = false;
  let colors = { on: '', head: '', off: '', hint: '' };

  const dur = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track.duration);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const readColors = () => {
    const cs = getComputedStyle(root);
    colors = { on: cs.getPropertyValue('--orange').trim(), head: cs.getPropertyValue('--text-strong').trim(), off: cs.getPropertyValue('--line-2').trim(), hint: cs.getPropertyValue('--muted-2').trim() };
  };

  function size() {
    const r = wave.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(r.width);
    H = Math.floor(r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // one bar per column: the loudest slice it covers
    const n = Math.max(1, Math.floor((W + GAP) / PITCH));
    cols = Array.from({ length: n }, (_, i) => {
      const a = Math.floor((i * peaks.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
      return Math.max(...peaks.slice(a, b));
    });
    draw();
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const n = cols.length, mid = Math.floor(H / 2), step = (mid - 2) / 9;
    const at = (audio.currentTime / dur()) * n;
    cols.forEach((lv, i) => {
      const half = 1 + Math.round(lv * step); // pixels above (and below) the middle line
      const x = i * PITCH, played = i < at, isHead = Math.floor(at) === i && at > 0;
      const hinted = hover >= 0 && !played && i <= hover;
      g.fillStyle = isHead ? colors.head : played ? colors.on : hinted ? colors.hint : colors.off;
      if (played || isHead) g.fillRect(x, mid - half, BAR, half * 2);
      // not yet played: every other row, a scanline dither
      else for (let y = mid - half; y < mid + half; y += 2) g.fillRect(x, y, BAR, 1);
    });
  }

  function sync() {
    const t = audio.currentTime;
    elapsed.textContent = mmss(t);
    wave.setAttribute('aria-valuenow', String(Math.round(t)));
    wave.setAttribute('aria-valuetext', `${mmss(t)} of ${mmss(dur())}`);
    draw();
  }

  const loop = () => { sync(); raf = audio.paused ? 0 : requestAnimationFrame(loop); };
  const setPlaying = (on: boolean) => {
    root.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  };
  const toggle = () => (audio.paused ? audio.play().catch(() => setPlaying(false)) : audio.pause());

  btn.addEventListener('click', toggle);
  audio.addEventListener('play', () => { setPlaying(true); if (!raf) raf = requestAnimationFrame(loop); });
  audio.addEventListener('pause', () => { setPlaying(false); root.classList.remove('wait'); sync(); });
  audio.addEventListener('waiting', () => root.classList.add('wait'));
  audio.addEventListener('playing', () => root.classList.remove('wait'));
  audio.addEventListener('ended', () => { audio.currentTime = 0; sync(); });
  audio.addEventListener('seeked', sync);

  // seeking: click or drag along the waveform
  const fracAt = (e: PointerEvent) => Math.min(1, Math.max(0, (e.clientX - wave.getBoundingClientRect().left) / W));
  const seek = (f: number) => { audio.currentTime = f * dur(); sync(); };
  wave.addEventListener('pointerdown', (e) => {
    dragging = true;
    wave.setPointerCapture(e.pointerId);
    seek(fracAt(e));
  });
  wave.addEventListener('pointermove', (e) => {
    if (dragging) return seek(fracAt(e));
    if (e.pointerType === 'mouse') { hover = Math.floor(fracAt(e) * cols.length); draw(); }
  });
  const end = () => { dragging = false; };
  wave.addEventListener('pointerup', end);
  wave.addEventListener('pointercancel', end);
  wave.addEventListener('pointerleave', () => { hover = -1; draw(); });
  wave.addEventListener('keydown', (e) => {
    const t = audio.currentTime, d = dur();
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? t + 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? t - 5 : e.key === 'Home' ? 0 : e.key === 'End' ? d - 1 : null;
    if (to !== null) { e.preventDefault(); seek(Math.min(d, Math.max(0, to)) / d); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });

  // the phone's lock screen and headphone buttons
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime !== undefined) seek(d.seekTime / dur()); });
  }

  readColors();
  size();
  new ResizeObserver(size).observe(wave);
  window.addEventListener('site:theme', () => { readColors(); draw(); });
}
