import type { ReactElement } from "react";
import { money } from "../format.ts";
import { Panel } from "./Panel.tsx";
import { Plot, SERIES } from "./chart.tsx";
import type { Snapshot } from "../hooks/useSimulation.ts";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * Takings and what's left of them.
 *
 * Two series on one axis — both are pounds, so one axis is honest. The band
 * between them is every cost of the day (energy, maintenance, rent), which is
 * exactly `revenue − margin`; drawing it as a gap rather than a third line
 * means the chart shows the subtraction instead of asking you to do it.
 *
 * Capital spending is deliberately absent: an upgrade hits cash, not margin
 * (D12), and putting it here would make every upgrade look like a disaster in
 * the window it lands.
 */
export function EconomicsTrendChart({
  state,
  snapshots,
}: {
  state: SimulationState;
  snapshots: Snapshot[];
}): ReactElement {
  const duration = state.scenario.durationSeconds;

  const revenue: [number, number][] = snapshots.map((s) => [
    s.atSecond,
    s["revenue_cum_amount"] ?? 0,
  ]);
  const margin: [number, number][] = snapshots.map((s) => [
    s.atSecond,
    Math.max(0, s["cum_margin_amount"] ?? 0),
  ]);

  const goal = state.scenario.goals.minOperatingMargin;
  const top = Math.max(goal * 1.4, ...revenue.map(([, v]) => v * 1.15));

  return (
    <Panel title="Takings and margin" hint="cumulative, today">
      <Plot
        label="Cumulative revenue and operating margin across the day"
        series={[
          { name: "Taken", colour: SERIES.primary, points: revenue },
          { name: "Kept", colour: SERIES.secondary, points: margin },
        ]}
        xMax={duration}
        yMax={top}
        band
        threshold={{ value: goal, label: "goal" }}
        formatValue={(v) => money(v)}
      />
      <p className="note">
        The gap between the two lines is the day's costs. The dashed rule is the{" "}
        {money(goal)} margin you need by midnight. Capital spending isn't counted here — it comes
        out of cash.
      </p>
    </Panel>
  );
}
