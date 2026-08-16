import type { ReactElement } from "react";
import { Panel } from "./Panel.tsx";
import { Plot, SERIES } from "./chart.tsx";
import type { Snapshot } from "../hooks/useSimulation.ts";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * Wait and abandonment, as two plots sharing an x-axis.
 *
 * They are **not** two lines on one plot: minutes and percent are different
 * scales, and a second y-axis is the single most misread thing in dashboard
 * charting. Stacking them keeps the binding pairing rule (a falling wait must
 * never be readable without the abandonment that may have caused it) while
 * each plot keeps one honest axis.
 */
export function WaitTimeTrendChart({
  state,
  snapshots,
}: {
  state: SimulationState;
  snapshots: Snapshot[];
}): ReactElement {
  const duration = state.scenario.durationSeconds;

  const wait: [number, number][] = snapshots.map((s) => [
    s.atSecond,
    (s["avg_wait_seconds"] ?? 0) / 60,
  ]);
  const abandonment: [number, number][] = snapshots.map((s) => [
    s.atSecond,
    s["abandonment_rate_pct"] ?? 0,
  ]);

  const waitMax = Math.max(12, ...wait.map(([, v]) => v * 1.2));
  const abandonMax = Math.max(20, ...abandonment.map(([, v]) => v * 1.2));

  return (
    <Panel title="Waiting and walking away" hint="across the day">
      <Plot
        label="Average wait in minutes across the day"
        series={[{ name: "Average wait", colour: SERIES.primary, points: wait }]}
        xMax={duration}
        yMax={waitMax}
        threshold={{ value: state.scenario.goals.maxAvgWaitSeconds / 60, label: "goal" }}
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
