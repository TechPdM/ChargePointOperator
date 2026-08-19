/**
 * Vehicle termination — the one place a vehicle leaves the site.
 *
 * Invariant 7 requires exactly one terminal state and exactly one leave reason
 * per vehicle, and the funnel counters to sum to `arrived`. Funnel bookkeeping
 * for each reason therefore lives at the call sites (which know *why*), while
 * the terminal-state write lives here (so there is only one of them).
 */

import { archetypeName } from "../core/labels.ts";
import { dataOf, emit, type TickContext } from "../core/context.ts";
import type { QueueLeaveReason, VehicleAgent } from "../core/types.ts";

export function departVehicle(
  ctx: TickContext,
  vehicle: VehicleAgent,
  reason: QueueLeaveReason,
): void {
  if (vehicle.state === "left" || vehicle.state === "complete") return;
  vehicle.state = reason === "completed" ? "complete" : "left";
  vehicle.leaveReason = reason;
  vehicle.leftAtSecond = ctx.state.clock.secondsElapsed;

  // D39: the agent is replaced by a flat record and dropped from `vehicles`, so
  // `vehicles` means "still on site" and the per-tick clone stops carrying the
  // whole day's traffic. The record keeps what anything reads plus what a later
  // analysis would miss; the caller's own reference stays valid, which is what
  // lets the emit below still read from it.
  ctx.state.departedVehicles.push({
    id: vehicle.id,
    archetype: vehicle.archetype,
    outcome: vehicle.state,
    leaveReason: reason,
    arrivalSecond: vehicle.arrivalSecond,
    queuedAtSecond: vehicle.queuedAtSecond,
    chargingStartedAtSecond: vehicle.chargingStartedAtSecond,
    leftAtSecond: vehicle.leftAtSecond,
    expectedWaitSeconds: vehicle.expectedWaitSeconds,
    requestedKwh: vehicle.demand.requestedKwh,
    finalSoc: vehicle.currentSoc,
    detourMinutes: vehicle.detourMinutes,
    maxAcceptablePricePerKwh: vehicle.demand.maxAcceptablePricePerKwh,
  });
  delete ctx.state.vehicles[vehicle.id];

  emit(ctx, "debug", "vehicle.departed", `${archetypeName(vehicle.archetype)} departed (${reason})`, {
    entity_type: "vehicle",
    entity_id: vehicle.id,
    data: dataOf({
      leave_reason: reason,
      archetype: vehicle.archetype,
      seconds_on_site: ctx.state.clock.secondsElapsed - vehicle.arrivalSecond,
    }),
  });
}
