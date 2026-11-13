/**
 * Dev-only diagnostics for "the dashboard stopped updating".
 *
 * Everything here is a no-op in a production build (`import.meta.env.DEV` is
 * false), so it costs the live site nothing. In dev it writes to the console
 * with a `[CPO]` prefix — filter the console on that — and records:
 *
 *   - every player action, and every pause / resume / end of day, with the sim clock
 *   - main-thread blocks over 100 ms (long tasks), with the sim clock
 *   - game-loop frames more than 500 ms apart, with tab visibility and focus,
 *     so a browser-throttled frame gap can be told apart from a blocked one
 *   - any frame that spent more than 50 ms running ticks
 *   - the loop running while React has not re-rendered for over a second
 *   - an exception escaping the game loop, and any uncaught error or rejection
 */

const ON = import.meta.env.DEV;
const TAG = "[CPO]";

let clock: () => string = () => "?";
let running = false;
let lastRender = performance.now();
let lastFrame = 0;
let installed = false;

function where(): Record<string, unknown> {
  return {
    sim: clock(),
    visible: document.visibilityState,
    focused: document.hasFocus(),
    atMs: Math.round(performance.now()),
  };
}

export function devInfo(message: string, data: Record<string, unknown> = {}): void {
  if (ON) console.info(TAG, message, { ...data, ...where() });
}

export function devWarn(message: string, data: Record<string, unknown> = {}): void {
  if (ON) console.warn(TAG, message, { ...data, ...where() });
}

export function devError(message: string, error: unknown): void {
  if (ON) console.error(TAG, message, error, where());
}

/** The dashboard tells the logger what the sim clock reads and whether it is running. */
export function devSetContext(readClock: () => string, isRunning: boolean): void {
  if (!ON) return;
  clock = readClock;
  running = isRunning;
}

/** Called after every React commit of the dashboard. */
export function devNoteRender(): void {
  if (ON) lastRender = performance.now();
}

/** Called once per game-loop frame. */
export function devNoteFrame(gapMs: number, ticks: number, workMs: number): void {
  if (!ON) return;
  lastFrame = performance.now();
  if (gapMs > 500) devWarn("game loop: frames were late", { gapMs: Math.round(gapMs), ticks });
  if (workMs > 50) {
    devWarn("game loop: slow frame", { workMs: Math.round(workMs), ticks });
  }
}

export function installDevLogger(): void {
  if (!ON || installed) return;
  installed = true;

  window.addEventListener("error", (e) => devError("uncaught error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => devError("unhandled rejection", e.reason));
  document.addEventListener("visibilitychange", () => devInfo(`tab ${document.visibilityState}`));
  window.addEventListener("blur", () => devInfo("window lost focus"));
  window.addEventListener("focus", () => devInfo("window gained focus"));

  if (typeof PerformanceObserver !== "undefined") {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 100) {
            devWarn("main thread blocked", { durationMs: Math.round(entry.duration) });
          }
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      devInfo("long-task observer unavailable in this browser");
    }
  }

  // Loop is producing frames, the day is running, but React has not committed
  // a render for over a second: the UI is stuck even though the clock is not.
  let warned = false;
  window.setInterval(() => {
    const now = performance.now();
    const loopAlive = now - lastFrame < 500;
    const stale = now - lastRender > 1_000;
    if (running && loopAlive && stale && !warned) {
      warned = true;
      devWarn("UI not re-rendering while the loop runs", {
        sinceRenderMs: Math.round(now - lastRender),
      });
    }
    if (!stale) warned = false;
  }, 500);

  devInfo("dev logger installed — filter the console on [CPO]");
}
