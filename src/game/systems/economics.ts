/**
 * Operating costs and cash — C10.
 *
 * `margin = revenue − energyCost − maintenance − fixed opex`. Capex is excluded
 * from margin (D12) but does hit cash, which is why invariant 6 reconciles
 * against five terms and the margin formula against four.
 *
 * Revenue and energy cost accrue per tick as energy is delivered (charging.ts);
 * repair call-outs and capex are debited at the action tick (playerActions.ts).
 * This step adds the two standing charges and settles cash.
 */

import { MAINTENANCE } from "../core/calibration.ts";
import type { TickContext } from "../core/context.ts";
import type { SimulationState } from "../core/types.ts";

export function applyOperatingCosts(ctx: TickContext): void {
  const { state } = ctx;
  const dayFraction = ctx.delta / 86_400;

  const standing = MAINTENANCE[state.site.policy.maintenanceLevel].standingCostPerSimDay * dayFraction;
  const opex = state.scenario.opexPerSimDay * dayFraction;

  state.site.economics.maintenanceCostToday += standing;
  state.site.economics.opexAccruedToday += opex;
  ctx.sample.maintenanceCost += standing;
  ctx.sample.opexAccrued += opex;

  state.site.economics.cash +=
    ctx.sample.revenue -
    ctx.sample.energyCost -
    ctx.sample.maintenanceCost -
    ctx.sample.opexAccrued -
    ctx.sample.capex;
}

/** CUM operating margin — the scored economic goal (D10). */
export function cumulativeMargin(state: SimulationState): number {
  const e = state.site.economics;
  return e.revenueToday - e.energyCostToday - e.maintenanceCostToday - e.opexAccruedToday;
}
