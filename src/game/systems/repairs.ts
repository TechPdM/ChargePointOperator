/**
 * Starting a repair — shared by the player's call-out and the maintenance
 * contractor (D53), so the two cannot drift on duration or cost.
 */

import { CALL_OUT_PREMIUM, MAINTENANCE } from "../core/calibration.ts";
import { dataOf, emit, type TickContext } from "../core/context.ts";
import type { ChargerBay, MaintenanceLevel } from "../core/types.ts";

export type RepairDispatcher = "player" | "contract";

/**
 * What a repair costs. The contractor's own visit is the flat call-out (D33);
 * a player call-out on a contract tier pays the D59 premium on top, because it
 * jumps the contractor's queue. On `reactive` a player call-out is the only
 * kind there is, so it pays the flat rate.
 */
export function repairCost(level: MaintenanceLevel, dispatchedBy: RepairDispatcher): number {
  const profile = MAINTENANCE[level];
  const jumpsContract = dispatchedBy === "player" && profile.contractResponseSeconds !== undefined;
  return profile.costPerRepair + (jumpsContract ? CALL_OUT_PREMIUM : 0);
}

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
  const level = state.site.policy.maintenanceLevel;
  const profile = MAINTENANCE[level];
  const durationSeconds = Math.round(bay.spec.repairSecondsMean * profile.repairTimeMultiplier);
  const cost = repairCost(level, dispatchedBy);
  bay.state = "repairing";
  bay.repairScheduledAtSecond = state.clock.secondsElapsed;
  bay.repairDueAtSecond = state.clock.secondsElapsed + durationSeconds;
  state.site.economics.maintenanceCostToday += cost;
  ctx.sample.maintenanceCost += cost;

  emit(ctx, "info", "charger.repair_started", `${bay.label} under repair`, {
    entity_type: "charger",
    entity_id: bay.id,
    data: dataOf({
      repair_seconds: durationSeconds,
      fault_category: bay.faultCategory ?? null,
      dispatched_by: dispatchedBy,
      repair_cost_amount: cost,
    }),
  });
  return { durationSeconds, cost };
}
