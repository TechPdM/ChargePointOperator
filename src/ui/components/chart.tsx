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
  /**
   * A `null` value is a gap, not a zero: the window held no measurement. The
   * line breaks there rather than diving to the floor, because a plotted zero
   * is a claim and this one would be false.
   */
  points: [number, number | null][];
}

export interface PlotProps {
  series: Series[];
  /** Domain of the x axis in sim-seconds — fixed, so the plot never rescales. */
  xMax: number;
  yMax: number;
  /** Floor of the y axis. Below 0 for a measure that can go negative (margin). */
  yMin?: number;
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
  yMin = 0,
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

  const floor = Math.min(yMin, 0);
  const top = yMax <= floor ? floor + 1 : yMax;
  const x = (seconds: number): number =>
    PAD.left + (seconds / xMax) * (width - PAD.left - PAD.right);
  const y = (value: number): number =>
    PAD.top + (1 - clamp01((value - floor) / (top - floor))) * (height - PAD.top - PAD.bottom);

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
            y1={y(floor + (top - floor) * f)}
            y2={y(floor + (top - floor) * f)}
          />
        ))}
        {/* Where the axis runs below zero, the zero line is the one that means
            something — it is the difference between making and losing money. */}
        {floor < 0 ? (
          <line className="grid grid-zero" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
        ) : null}
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
        <text className="axis-label" x={PAD.left - 6} y={y(floor)} textAnchor="end">
          {floor === 0 ? "0" : formatValue(floor)}
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
          series.map((s) => {
            const v = lastValue(s);
            return (
              <span key={s.name} className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ background: s.colour }}
                  aria-hidden="true"
                />
                {s.name}
                <b>{v === null ? "—" : formatValue(v)}</b>
              </span>
            );
          })
        ) : (
          <>
            <span className="legend-time">{clockAt(hover)}</span>
            {series.map((s, i) => {
              const v = readouts[i];
              return (
                <span key={s.name} className="legend-item">
                  <span
                    className="legend-swatch"
                    style={{ background: s.colour }}
                    aria-hidden="true"
                  />
                  {s.name}
                  <b>{v === null || v === undefined ? "—" : formatValue(v)}</b>
                </span>
              );
            })}
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** A gap (null) lifts the pen: the next real point starts a fresh subpath. */
function linePath(
  series: Series,
  x: (v: number) => number,
  y: (v: number) => number,
): string {
  let out = "";
  let penDown = false;
  for (const [px, py] of series.points) {
    if (py === null) {
      penDown = false;
      continue;
    }
    out += `${penDown ? "L" : "M"}${x(px).toFixed(2)},${y(py).toFixed(2)} `;
    penDown = true;
  }
  return out.trim();
}

/**
 * The filled band between two series. Gaps are dropped rather than broken into
 * separate polygons — the band is a reading aid for the gap between two lines,
 * and both series it is used on (revenue, margin) are always measured.
 */
function bandPath(
  upper: Series,
  lower: Series,
  x: (v: number) => number,
  y: (v: number) => number,
): string {
  const up = defined(upper);
  const down = defined(lower);
  if (up.length === 0 || down.length === 0) return "";
  const top = up
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${x(px).toFixed(2)},${y(py).toFixed(2)}`)
    .join(" ");
  const bottom = [...down]
    .reverse()
    .map(([px, py]) => `L${x(px).toFixed(2)},${y(py).toFixed(2)}`)
    .join(" ");
  return `${top} ${bottom} Z`;
}

function defined(series: Series): [number, number][] {
  const out: [number, number][] = [];
  for (const [px, py] of series.points) if (py !== null) out.push([px, py]);
  return out;
}

/** Nearest MEASURED point — the crosshair never reads a value out of a gap. */
function valueAt(series: Series, atX: number): number | null {
  const points = defined(series);
  const first = points[0];
  if (!first) return null;
  let best = first;
  for (const point of points) {
    if (Math.abs(point[0] - atX) < Math.abs(best[0] - atX)) best = point;
  }
  return best[1];
}

function lastValue(series: Series): number | null {
  const points = defined(series);
  return points[points.length - 1]?.[1] ?? null;
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
