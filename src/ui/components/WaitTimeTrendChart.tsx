import { memo } from "react";
import type { ReactElement } from "react";
import { Panel } from "./Panel.tsx";
import { Plot, SERIES } from "./chart.tsx";
import type { Snapshot } from "../hooks/useSimulation.ts";

/**
 * Wait and abandonment, as two plots sharing an x-axis.
 *
 * They are **not** two lines on one plot: minutes and percent are different
 * scales, and a second y-axis is the single most misread thing in dashboard
 * charting. Stacking them keeps the binding pairing rule (a falling wait must
 * never be readable without the abandonment that may have caused it) while
 * each plot keeps one honest axis.
 *
 * Takes the two scenario constants it reads rather than the whole state, so it
 * can be memoised on them (D41). `snapshots` only gains an entry every fifth
 * tick, so four in five of this component's renders were redrawing an identical
 * plot — and it could not be memoised while it took `state`, because `tick`
 * structuredClones the world and `state.scenario` is therefore a fresh object
 * every tick even though nothing in it ever changes.
 */
function WaitTimeTrendChartImpl({
  durationSeconds,
  maxAvgWaitSeconds,
  snapshots,
}: {
  durationSeconds: number;
  maxAvgWaitSeconds: number;
  snapshots: Snapshot[];
}): ReactElement {
  const duration = durationSeconds;

  // A snapshot whose window held no started session has no measured wait — the
  // stored 0 is a default, not a reading, and plotting it draws a dive to the
  // floor exactly when the site is at its most jammed. The line breaks instead.
  const wait: [number, number | null][] = snapshots.map((s) => [
    s.atSecond,
    (s["avg_wait_started_sessions"] ?? 0) > 0 ? (s["avg_wait_seconds"] ?? 0) / 60 : null,
  ]);
  const abandonment: [number, number | null][] = snapshots.map((s) => [
    s.atSecond,
    s["abandonment_rate_pct"] ?? 0,
  ]);

  const waitMax = Math.max(12, ...wait.map(([, v]) => (v ?? 0) * 1.2));
  const abandonMax = Math.max(20, ...abandonment.map(([, v]) => (v ?? 0) * 1.2));

  return (
    <Panel title="Waiting and walking away" hint="across the day">
      <Plot
        label="Average wait in minutes across the day"
        series={[{ name: "Average wait", colour: SERIES.primary, points: wait }]}
        xMax={duration}
        yMax={waitMax}
        threshold={{ value: maxAvgWaitSeconds / 60, label: "goal" }}
        formatValue={(v) => `${v.toFixed(0)} min`}
      />
      <Plot
        label="Share of waiting drivers who gave up, across the day"
        series={[{ name: "Gave up waiting", colour: SERIES.secondary, points: abandonment }]}
        xMax={duration}
        yMax={abandonMax}
        formatValue={(v) => `${v.toFixed(0)}%`}
      />
      <p className="note">
        Read these together. A wait that drops while the lower plot climbs means the queue emptied
        itself — that isn't the site getting faster.
      </p>
    </Panel>
  );
}

export const WaitTimeTrendChart = memo(WaitTimeTrendChartImpl);
