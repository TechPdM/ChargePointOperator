import { useEffect, useRef, type ReactElement } from "react";
import { DISCHARGE_MARGIN, playFrameDischarge } from "../effects/frameDischarge.ts";

/**
 * The goals-met celebration, laid over the end-of-day panel. `PostRunSummary`
 * renders it only on a day where every goal is met, so it mounts, and plays,
 * once when that panel appears.
 *
 * At the discharge it adds `is-lit` to the panel, which gives the border its
 * green glow (CSS). With reduced motion asked for, it skips the animation and
 * only lights the border.
 */
export function GoalsMetEffect(): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const panel = el?.parentElement;
    if (!el || !panel) return;
    const light = (): void => panel.classList.add("is-lit");
    const unlight = (): void => panel.classList.remove("is-lit");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      light();
      return unlight;
    }
    const cancel = playFrameDischarge(el, light);
    return () => {
      cancel();
      unlight();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className="goals-met-effect"
      style={{ inset: -DISCHARGE_MARGIN }}
      aria-hidden="true"
    />
  );
}
