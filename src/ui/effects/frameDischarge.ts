/**
 * "Current round the frame, full-frame discharge" — the goals-met celebration
 * on the end-of-day panel (option C2, chosen by Mark 2026-11-14).
 *
 * An arc of current runs twice round the panel's border, speeding up, then the
 * whole border flickers bright twice and throws sparks outward from every
 * edge. Pure canvas, no library, ~2.8 s, then it clears itself.
 *
 * The canvas is laid over the panel with a margin on every side
 * (`DISCHARGE_MARGIN`) so the sparks have somewhere to fly. The frame is
 * measured from the panel element itself, never inferred from the canvas.
 */

export const DISCHARGE_MARGIN = 80;

const LAPS = 2;
const TRAVEL_MS = 1350;
const TOTAL_MS = 2800;

interface Colours {
  ok: string;
  warn: string;
  info: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function readColours(): Colours {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    css.getPropertyValue(name).trim() || fallback;
  return { ok: v("--ok", "#3dd68c"), warn: v("--warn", "#f0b429"), info: v("--info", "#5bb0f2") };
}

/**
 * Run the effect on `canvas` (laid over `panel` with room round it), tracing
 * `panel`'s border. Returns a cancel function.
 */
export function playFrameDischarge(
  canvas: HTMLCanvasElement,
  panel: HTMLElement,
  onDischarge?: () => void,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = rect.width;
  const H = rect.height;
  // Measured, not assumed: the panel's own border box, in canvas coordinates,
  // so the current runs along the border actually drawn on screen.
  const box = panel.getBoundingClientRect();
  const px = box.left - rect.left + 0.5;
  const py = box.top - rect.top + 0.5;
  const pw = box.width - 1;
  const ph = box.height - 1;
  if (pw <= 0 || ph <= 0) return () => {};

  const C = readColours();
  const per = 2 * (pw + ph);
  // The dashboard panel is wide; cap the trail so it reads as a spark, not a stripe.
  const tail = Math.min(per * 0.22, 420);
  const dischargeSparks = Math.round(Math.min(320, Math.max(140, per / 10)));

  /** Point on the border at distance s, with its outward normal. */
  const at = (s: number): [number, number, number, number] => {
    s = ((s % per) + per) % per;
    if (s < pw) return [px + s, py, 0, -1];
    if (s < pw + ph) return [px + pw, py + (s - pw), 1, 0];
    if (s < 2 * pw + ph) return [px + pw - (s - pw - ph), py + ph, 0, 1];
    return [px, py + ph - (s - 2 * pw - ph), -1, 0];
  };

  const sparks: Spark[] = [];
  const spray = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    n: number,
    spread: number,
    vMin: number,
    vMax: number,
  ): void => {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rand(-spread, spread);
      const v = rand(vMin, vMax);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(24, 55), age: 0 });
    }
  };

  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const strokeFrame = (colour: string, width: number, alpha: number): void => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.strokeRect(px, py, pw, ph);
  };

  let fired = false;
  let raf = 0;
  const t0 = performance.now();

  const frame = (now: number): void => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";

    if (t < TRAVEL_MS) {
      // Speeds up into the hit.
      const head = LAPS * per * Math.pow(t / TRAVEL_MS, 1.35);
      const n = 46;
      let prev: [number, number] | null = null;
      for (let i = 0; i <= n; i++) {
        const [x, y] = at(head - tail * (i / n));
        const jx = x + rand(-2.5, 2.5);
        const jy = y + rand(-2.5, 2.5);
        if (prev) {
          const a = 1 - i / n;
          ctx.globalAlpha = 0.25 * a;
          ctx.strokeStyle = C.info;
          ctx.lineWidth = 7;
          line(prev[0], prev[1], jx, jy);
          ctx.globalAlpha = a;
          ctx.strokeStyle = i < 6 ? "#ffffff" : C.ok;
          ctx.lineWidth = 2;
          line(prev[0], prev[1], jx, jy);
        }
        prev = [jx, jy];
      }
      const [hx, hy] = at(head);
      spray(hx, hy, 0, -1, 3, Math.PI, 1.5, 4.5);
    } else if (!fired) {
      fired = true;
      for (let i = 0; i < dischargeSparks; i++) {
        const [x, y, nx, ny] = at(rand(0, per));
        spray(x, y, nx, ny, 1, 0.6, 2, 6.5);
      }
      onDischarge?.();
    }

    // Two arc flickers, then a fade.
    const age = t - TRAVEL_MS;
    if (age >= 0) {
      const f =
        age < 70 ? 1 : age < 120 ? 0.25 : age < 190 ? 0.95 : age < 520 ? 1 - (age - 190) / 330 : 0;
      if (f > 0) {
        ctx.globalAlpha = 0.1 * f;
        ctx.fillStyle = C.info;
        ctx.fillRect(0, 0, W, H);
        strokeFrame(C.info, 12, 0.4 * f);
        strokeFrame("#ffffff", 2.5, f);
      }
    }

    for (const s of sparks) {
      if (s.age > s.life) continue;
      s.age++;
      s.vy += 0.12;
      s.vx *= 0.985;
      s.x += s.vx;
      s.y += s.vy;
      ctx.globalAlpha = 1 - s.age / s.life;
      ctx.strokeStyle = s.age < 7 ? "#ffffff" : s.age < 18 ? C.warn : C.ok;
      ctx.lineWidth = 1.5;
      line(s.x, s.y, s.x - s.vx * 2.2, s.y - s.vy * 2.2);
    }
    ctx.globalAlpha = 1;

    if (t < TOTAL_MS) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  };

  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
  };
}
