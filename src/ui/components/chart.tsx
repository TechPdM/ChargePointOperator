/**
 * Chart primitives — hand-rolled SVG (D28).
 *
 * Rules taken from the data-visualisation method and not negotiable here:
 *  - **One axis per plot.** Two measures of different scale become two stacked
 *    plots sharing an x-axis, never two y-scales on one plot.
 *  - Thin marks (2px), recessive grid, selective direct labels, no marker on
 *    every point.
 *  - Series colours are the validated categorical pair; status colours stay
 *    reserved for state and are used only for threshold rules.
 *  - A crosshair readout ships by default — an SVG chart is interactive.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

export const SERIES = {
  /** Slot 1 — also the rapid-charger tier colour across the dashboard. */
  primary: "#1B8CAC",
  /** Slot 2 — also the ultra-rapid tier colour. */
  secondary: "#8B7FF5",
} as const;

export interface Series {
  name: string;
  colour: string;
  points: [number, number][];
}

export interface PlotProps {
  series: Series[];
  /** Domain of the x axis in sim-seconds — fixed, so the plot never rescales. */
  xMax: number;
  yMax: number;
  height?: number;
  /** A goal or threshold, drawn as a dashed rule and labelled. */
  threshold?: { value: number; label: string };
  /** Fill the band between the first two series (e.g. revenue minus margin). */
  band?: boolean;
  formatValue: (value: number) => string;
  label: string;
}

const PAD = { top: 10, right: 8, bottom: 16, left: 44 };
const HOURS = [0, 6, 12, 18, 24];

export function Plot({
  series,
  xMax,
  yMax,
  height = 96,
  threshold,
  band,
  formatValue,
  label,
}: PlotProps): ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  // The viewBox tracks the element's real pixel width so one SVG unit is one
  // pixel. Stretching a fixed viewBox to fit would scale the text and the
  // stroke widths with it, which is why the axis labels came out smeared.
  const width = useElementWidth(ref, 420);

  const top = yMax <= 0 ? 1 : yMax;
  const x = (seconds: number): number =>
    PAD.left + (seconds / xMax) * (width - PAD.left - PAD.right);
  const y = (value: number): number =>
    PAD.top + (1 - clamp01(value / top)) * (height - PAD.top - PAD.bottom);

  const onMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = ref.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const fraction = (px - PAD.left) / (rect.width - PAD.left - PAD.right);
      setHover(clamp01(fraction) * xMax);
    },
    [],
  );

  const readouts = hover === null ? [] : series.map((s) => valueAt(s, hover));

  return (
    <figure className="plot" aria-label={label}>
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Grid: recessive, three rules, never competing with the data. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="grid"
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(top * f)}
            y2={y(top * f)}
          />
        ))}
        {HOURS.map((h) => (
          <line
            key={h}
            className="grid grid-v"
            x1={x((h / 24) * xMax)}
            x2={x((h / 24) * xMax)}
            y1={PAD.top}
            y2={height - PAD.bottom}
          />
        ))}

        {band && series[0] && series[1] ? (
          <path className="band" d={bandPath(series[0], series[1], x, y)} />
        ) : null}

        {threshold ? (
          <line
            className="threshold"
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(threshold.value)}
            y2={y(threshold.value)}
          />
        ) : null}

        {series.map((s) => (
          <path key={s.name} className="series" style={{ stroke: s.colour }} d={linePath(s, x, y)} />
        ))}

        {hover !== null ? (
          <>
            <line
              className="crosshair"
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={height - PAD.bottom}
            />
            {series.map((s, i) => {
              const v = readouts[i];
              return v === null || v === undefined ? null : (
                <circle key={s.name} cx={x(hover)} cy={y(v)} r={2.5} style={{ fill: s.colour }} />
              );
            })}
          </>
        ) : null}

        <text className="axis-label" x={PAD.left - 6} y={y(top)} textAnchor="end">
          {formatValue(top)}
        </text>
        <text className="axis-label" x={PAD.left - 6} y={y(0)} textAnchor="end">
          0
        </text>
        {HOURS.map((h) => (
          <text
            key={h}
            className="axis-label"
            x={x((h / 24) * xMax)}
            y={height - 4}
            textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
          >
            {String(h).padStart(2, "0")}
          </text>
        ))}
      </svg>

      <figcaption className="plot-readout">
        {hover === null ? (
          series.map((s) => (
            <span key={s.name} className="legend-item">
              <span className="legend-swatch" style={{ background: s.colour }} aria-hidden="true" />
              {s.name}
              <b>{formatValue(lastValue(s))}</b>
            </span>
          ))
        ) : (
          <>
            <span className="legend-time">{clockAt(hover)}</span>
            {series.map((s, i) => (
              <span key={s.name} className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ background: s.colour }}
                  aria-hidden="true"
                />
                {s.name}
                <b>{formatValue(readouts[i] ?? 0)}</b>
              </span>
            ))}
          </>
        )}
      </figcaption>
    </figure>
  );
}

function linePath(
  series: Series,
  x: (v: number) => number,
  y: (v: number) => number,
): string {
  if (series.points.length === 0) return "";
  return series.points
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${x(px).toFixed(2)},${y(py).toFixed(2)}`)
    .join(" ");
}

function bandPath(
  upper: Series,
  lower: Series,
  x: (v: number) => number,
  y: (v: number) => number,
): string {
  if (upper.points.length === 0) return "";
  const up = upper.points
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${x(px).toFixed(2)},${y(py).toFixed(2)}`)
    .join(" ");
  const down = [...lower.points]
    .reverse()
    .map(([px, py]) => `L${x(px).toFixed(2)},${y(py).toFixed(2)}`)
    .join(" ");
  return `${up} ${down} Z`;
}

function valueAt(series: Series, atX: number): number | null {
  if (series.points.length === 0) return null;
  let best = series.points[0];
  for (const point of series.points) {
    if (Math.abs(point[0] - atX) < Math.abs((best?.[0] ?? 0) - atX)) best = point;
  }
  return best?.[1] ?? null;
}

function lastValue(series: Series): number {
  return series.points[series.points.length - 1]?.[1] ?? 0;
}

function clockAt(seconds: number): string {
  const h = Math.floor(seconds / 3_600) % 24;
  const m = Math.floor((seconds % 3_600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Track the element's rendered width so the viewBox can stay 1 unit = 1 pixel. */
function useElementWidth(ref: React.RefObject<SVGSVGElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
