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
  ctx.state.departedVehicleIds.push(vehicle.id);

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
