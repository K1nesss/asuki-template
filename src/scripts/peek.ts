// Peek cards (GitHub, Duolingo, NetEase Cloud Music): CSS shows them on hover and keyboard focus; this
// keeps each card inside the screen, counts its numbers up from zero as it opens, and on touch screens
// makes the first tap open the card (the card itself is the link through).

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function mountPeeks(reduce: boolean) {
  const peeks = [...document.querySelectorAll<HTMLElement>('[data-peek]')];
  if (!peeks.length) return;
  const touch = matchMedia('(hover: none)');
  const frames = new WeakMap<HTMLElement, number>();
  const shownAt = new WeakMap<HTMLElement, number>();
  const leftAt = new WeakMap<HTMLElement, number>();

  // shift the card sideways so it stays 8px inside the window; the arrow stays on the button
  const place = (p: HTMLElement) => {
    const card = p.querySelector<HTMLElement>('.peek-card');
    const btn = p.firstElementChild as HTMLElement | null;
    if (!card || !btn) return;
    p.style.setProperty('--ax', `${btn.offsetWidth / 2 - 6}px`);
    const r = p.getBoundingClientRect();
    const w = card.offsetWidth, max = document.documentElement.clientWidth - 8;
    let dx = 0;
    if (r.left + w > max) dx = max - (r.left + w);
    if (r.left + dx < 8) dx = 8 - r.left;
    card.style.setProperty('--dx', `${Math.round(dx)}px`);
  };

  // each number runs up from zero, fast then settling, bigger numbers taking a little longer
  const count = (p: HTMLElement) => {
    p.querySelectorAll<HTMLElement>('[data-count]').forEach((b, i) => {
      const to = Number(b.dataset.count);
      if (!Number.isFinite(to)) return;
      cancelAnimationFrame(frames.get(b) ?? 0);
      if (reduce || to === 0) { b.textContent = fmt(to); return; }
      const dur = 650 + Math.min(550, Math.log10(to + 1) * 130);
      const t0 = performance.now() + 60 + i * 70;
      b.textContent = '0';
      const step = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / dur));
        b.textContent = fmt(to * (1 - Math.pow(1 - t, 4)));
        if (t < 1) frames.set(b, requestAnimationFrame(step));
      };
      frames.set(b, requestAnimationFrame(step));
    });
  };

  const show = (p: HTMLElement) => {
    // a quick out-and-back (the card was still fading) carries on rather than starting over
    if (performance.now() - (leftAt.get(p) ?? -1e9) < 260 && shownAt.has(p)) return;
    shownAt.set(p, performance.now());
    place(p);
    count(p);
  };
  const close = (except?: HTMLElement) => {
    for (const p of peeks) if (p !== except && p.hasAttribute('data-open')) { p.removeAttribute('data-open'); leftAt.set(p, performance.now()); }
  };

  for (const p of peeks) {
    p.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(p); });
    p.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') leftAt.set(p, performance.now()); });
    p.addEventListener('focusin', () => { if (!p.matches(':hover')) show(p); });
    p.addEventListener('focusout', (e) => { if (!p.contains(e.relatedTarget as Node)) leftAt.set(p, performance.now()); });
    const btn = p.firstElementChild as HTMLElement | null;
    btn?.addEventListener('click', (e) => {
      if (!touch.matches || p.hasAttribute('data-open')) return; // a second tap follows the link
      e.preventDefault();
      close(p);
      p.setAttribute('data-open', '');
      leftAt.delete(p);
      shownAt.delete(p);
      show(p);
    });
  }
  document.addEventListener('click', (e) => {
    const inside = (e.target as Element | null)?.closest?.('[data-peek]');
    close(inside instanceof HTMLElement ? inside : undefined);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('scroll', () => { if (touch.matches) close(); }, { passive: true });
}
