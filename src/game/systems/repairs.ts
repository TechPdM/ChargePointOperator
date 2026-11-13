/**
 * Starting a repair — shared by the player's call-out and the maintenance
 * contractor (D53), so the two cannot drift on duration or cost.
 */

import { MAINTENANCE } from "../core/calibration.ts";
import { dataOf, emit, type TickContext } from "../core/context.ts";
import type { ChargerBay } from "../core/types.ts";

export type RepairDispatcher = "player" | "contract";

/**
 * Put a faulted bay under repair and debit the call-out on this tick.
 *
 * Emits `charger.repair_started` only. `charger.repair_scheduled` is the
 * decision marker for `schedule_repair` and replay rebuilds player actions from
 * it, so the caller that represents a decision emits that one itself; a
 * contract repair is a sim consequence and must not.
 */
export function beginRepair(
  ctx: TickContext,
  bay: ChargerBay,
  dispatchedBy: RepairDispatcher,
): { durationSeconds: number; cost: number } {
  const { state } = ctx;
  const profile = MAINTENANCE[state.site.policy.maintenanceLevel];
  const durationSeconds = Math.round(bay.spec.repairSecondsMean * profile.repairTimeMultiplier);
  bay.state = "repairing";
  bay.repairScheduledAtSecond = state.clock.secondsElapsed;
  bay.repairDueAtSecond = state.clock.secondsElapsed + durationSeconds;
  state.site.economics.maintenanceCostToday += profile.costPerRepair;
  ctx.sample.maintenanceCost += profile.costPerRepair;

  emit(ctx, "info", "charger.repair_started", `${bay.label} under repair`, {
    entity_type: "charger",
    entity_id: bay.id,
    data: dataOf({
      repair_seconds: durationSeconds,
      fault_category: bay.faultCategory ?? null,
      dispatched_by: dispatchedBy,
    }),
  });
  return { durationSeconds, cost: profile.costPerRepair };
}
