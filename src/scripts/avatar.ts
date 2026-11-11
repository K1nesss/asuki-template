// The avatar turns over like a card when clicked. Its angle is a damped spring: it swings past the
// half-turn, rings back and settles. While it turns it tips back a little with the speed, swells
// slightly, and a band of light slides across the face. Under the pointer it leans toward it.
import { Spring, animate } from './spring';
import { sound } from './sound';

export function mountAvatar(btn: HTMLElement, reduce: boolean) {
  const card = btn.querySelector<HTMLElement>('[data-flip]')!;
  const turn = new Spring(0, { stiffness: 80, damping: 7.5 }); // degrees; damping ratio about .42
  const tiltX = new Spring(0, { stiffness: 180, damping: 14 });
  const tiltY = new Spring(0, { stiffness: 180, damping: 14 });
  let running = false, flipped = false;

  const render = () => {
    const a = turn.value, speed = turn.velocity;
    const lean = Math.max(-14, Math.min(14, -speed * 0.02)); // tips back with the spin
    const swell = 1 + Math.min(0.08, Math.abs(speed) / 9000);
    card.style.transform = `rotateX(${(tiltX.value + lean).toFixed(2)}deg) rotateY(${(a + tiltY.value).toFixed(2)}deg) scale(${swell.toFixed(3)})`;
    const side = Math.sin((a * Math.PI) / 180);
    card.style.setProperty('--sheen', Math.min(1, Math.abs(side) * 1.4).toFixed(2));
    card.style.setProperty('--shx', `${(side * 60).toFixed(1)}%`);
  };
  const run = () => {
    if (running) return;
    running = true;
    animate((dt) => {
      turn.step(dt); tiltX.step(dt); tiltY.step(dt);
      render();
      if (turn.settled && tiltX.settled && tiltY.settled) { running = false; return false; }
      return true;
    });
  };

  btn.addEventListener('click', () => {
    flipped = !flipped;
    btn.setAttribute('aria-pressed', String(flipped));
    sound('flip');
    if (reduce) { turn.value = turn.target = flipped ? 180 : 0; return render(); }
    turn.target = flipped ? 180 : 0;
    turn.kick(flipped ? 60 : -60); // a flick of the finger to start it
    run();
  });
  if (reduce) return;
  btn.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = btn.getBoundingClientRect();
    tiltX.target = -((e.clientY - r.top) / r.height - 0.5) * 16;
    tiltY.target = ((e.clientX - r.left) / r.width - 0.5) * 16;
    run();
  });
  btn.addEventListener('pointerleave', () => { tiltX.target = 0; tiltY.target = 0; run(); });
}
