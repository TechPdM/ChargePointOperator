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
    const cancel = playFrameDischarge(el, panel, light);
    return () => {
      cancel();
      unlight();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className="goals-met-effect"
      // Sized explicitly: a canvas is a replaced element, so `inset` alone
      // leaves it at its intrinsic pixel size instead of stretching it, and
      // the effect then measures (and draws round) a box unrelated to the panel.
      style={{
        left: -DISCHARGE_MARGIN,
        top: -DISCHARGE_MARGIN,
        width: `calc(100% + ${2 * DISCHARGE_MARGIN}px)`,
        height: `calc(100% + ${2 * DISCHARGE_MARGIN}px)`,
      }}
      aria-hidden="true"
    />
  );
}
