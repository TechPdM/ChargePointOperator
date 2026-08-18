import { memo } from "react";
import type { ReactElement } from "react";
import { money } from "../format.ts";
import { Panel } from "./Panel.tsx";
import { Plot, SERIES } from "./chart.tsx";
import type { Snapshot } from "../hooks/useSimulation.ts";

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
 *
 * Takes the two constants it reads rather than the whole state, so it can be
 * memoised — same shape and same reason as the wait chart (D41).
 */
function EconomicsTrendChartImpl({
  durationSeconds,
  minOperatingMargin,
  snapshots,
}: {
  durationSeconds: number;
  minOperatingMargin: number;
  snapshots: Snapshot[];
}): ReactElement {
  const duration = durationSeconds;

  const revenue: [number, number | null][] = snapshots.map((s) => [
    s.atSecond,
    s["revenue_cum_amount"] ?? 0,
  ]);
  // Not clamped at zero. The day opens in the red — rent and the maintenance
  // standing charge accrue from 00:00 against no takings — and a bad price
  // choice keeps it there. Flattening that onto the axis drew a loss as
  // break-even, and dragged the costs band with it.
  const margin: [number, number | null][] = snapshots.map((s) => [
    s.atSecond,
    s["cum_margin_amount"] ?? 0,
  ]);

  const goal = minOperatingMargin;
  const top = Math.max(goal * 1.4, ...revenue.map(([, v]) => (v ?? 0) * 1.15));
  const bottom = Math.min(0, ...margin.map(([, v]) => (v ?? 0) * 1.15));

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
        yMin={bottom}
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

export const EconomicsTrendChart = memo(EconomicsTrendChartImpl);
