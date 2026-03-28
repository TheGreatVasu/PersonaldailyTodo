/** Lightweight “game feel” when marking a task complete — particles + optional chime. */

const PRAISE = [
  "Nice!",
  "Done!",
  "Crushed it!",
  "That’s momentum!",
  "One more win!",
  "Power move!",
  "You showed up!",
  "Checked off!",
  "Yes!",
  "Keep going!",
];

const COMBO_PRAISE = ["Combo!", "On fire!", "Unstoppable!", "Chain reaction!", "Stacking wins!"];

export function pickPraise() {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}

export function pickComboPraise() {
  return COMBO_PRAISE[Math.floor(Math.random() * COMBO_PRAISE.length)];
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Short pleasant “ding” — only call from a user gesture (e.g. click). */
export function playCompletionChime() {
  if (prefersReducedMotion()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime;
    o.frequency.setValueAtTime(523.25, t0);
    o.frequency.exponentialRampToValueAtTime(659.25, t0 + 0.07);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.start(t0);
    o.stop(t0 + 0.2);
    o.onended = () => ctx.close();
  } catch {
    // ignore
  }
}

/** Particle burst at viewport coordinates (center of checkbox). */
export function completionBurst(clientX, clientY) {
  if (prefersReducedMotion()) return;
  const n = 16;
  const root = document.createElement("div");
  root.className = "completion-burst";
  root.setAttribute("aria-hidden", "true");
  root.style.left = `${clientX}px`;
  root.style.top = `${clientY}px`;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "completion-burst-particle";
    const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
    const dist = 32 + Math.random() * 28;
    p.style.setProperty("--burst-dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--burst-dy", `${Math.sin(angle) * dist}px`);
    const hue = (i * 47 + 130) % 360;
    p.style.background = `hsl(${hue} 82% 58%)`;
    root.appendChild(p);
  }
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add("completion-burst--play"));
  const done = () => {
    root.remove();
  };
  setTimeout(done, 720);
}

const CONFETTI_COLORS = [
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#a78bfa",
  "#fb923c",
  "#f87171",
  "#22d3ee",
  "#fde047",
  "#c084fc",
];

const CONFETTI_DURATION_MS = 3800;

/**
 * Party-popper style confetti: colorful pieces burst from the checkbox then fall with gravity.
 * pointer-events: none — does not block taps.
 */
export function completionConfettiBurst(clientX, clientY) {
  if (prefersReducedMotion()) return;
  const cx = clientX;
  const cy = clientY;

  const root = document.createElement("div");
  root.className = "completion-confetti-root";
  root.setAttribute("aria-hidden", "true");
  root.style.left = `${cx}px`;
  root.style.top = `${cy}px`;

  const count = 86;
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const blast = 9 + Math.random() * 16;
    const el = document.createElement("span");
    el.className = "completion-confetti-piece";
    const isRound = Math.random() < 0.35;
    const w = isRound ? 5 + Math.random() * 5 : 4 + Math.random() * 7;
    const h = isRound ? w : 3 + Math.random() * 9;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${-w / 2}px`;
    el.style.top = `${-h / 2}px`;
    if (!isRound) el.style.borderRadius = "1px";
    else el.style.borderRadius = "50%";
    el.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    root.appendChild(el);
    pieces.push({
      el,
      x: 0,
      y: 0,
      vx: Math.cos(angle) * blast,
      vy: Math.sin(angle) * blast - (10 + Math.random() * 8),
      vr: (Math.random() - 0.5) * 18,
      rot: Math.random() * 360,
      drag: 0.987 + Math.random() * 0.008,
    });
  }

  document.body.appendChild(root);

  const t0 = performance.now();
  const gravity = 0.42;

  function frame(now) {
    const t = now - t0;
    for (const p of pieces) {
      p.vy += gravity;
      p.vx *= p.drag;
      p.vy *= 0.998;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vr *= 0.99;
      const fade =
        t < CONFETTI_DURATION_MS * 0.9
          ? 1
          : Math.max(0, 1 - (t - CONFETTI_DURATION_MS * 0.9) / (CONFETTI_DURATION_MS * 0.1));
      p.el.style.opacity = String(fade);
      p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg)`;
    }
    if (t < CONFETTI_DURATION_MS + 420) {
      requestAnimationFrame(frame);
    } else {
      root.remove();
    }
  }

  requestAnimationFrame(frame);
}

/** Track rapid completes for combo messaging (session-only). */
export function createComboTracker(windowMs = 2800) {
  let last = 0;
  let combo = 0;
  return () => {
    const now = Date.now();
    if (now - last > windowMs) combo = 0;
    combo += 1;
    last = now;
    return combo;
  };
}
