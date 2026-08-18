/**
 * Invariants — Architecture §9.1. Checked every tick: throws in dev/test,
 * logs in prod.
 *
 * Invariant 9 (same seed ⇒ same final hash) is a property of a whole run rather
 * than of a single state, so it lives in the test suite, not here.
 */

import { bayList, round } from "../core/context.ts";
import type { TickContext } from "../core/context.ts";
import { bayCeilingKw } from "../core/selectors.ts";
import type { SimulationState } from "../core/types.ts";

export interface InvariantViolation {
  invariant: number;
  message: string;
  tick: number;
  atSecond: number;
}

export type InvariantMode = "throw" | "collect";

const CASH_EPSILON = 1e-6;
const POWER_EPSILON = 1e-6;

export function checkInvariants(ctx: TickContext, mode: InvariantMode = "throw"): InvariantViolation[] {
  const { state } = ctx;
  const violations: InvariantViolation[] = [];
  const fail = (invariant: number, message: string): void => {
    violations.push({
      invariant,
      message,
      tick: state.clock.tick,
      atSecond: state.clock.secondsElapsed,
    });
  };

  // 1. Queue is sane and free of duplicates.
  if (state.queue.length < 0 || state.queue.length > state.scenario.maxQueueLength) {
    fail(1, `queue length ${state.queue.length} outside [0, ${state.scenario.maxQueueLength}]`);
  }
  const seen = new Set<string>();
  for (const entry of state.queue) {
    if (seen.has(entry.vehicleId)) fail(1, `vehicle ${entry.vehicleId} queued twice`);
    seen.add(entry.vehicleId);
  }

  // 2. Power never exceeds the grid cap, nor any bay's own ceiling.
  let totalAllocated = 0;
  for (const bay of bayList(state)) {
    totalAllocated += bay.allocatedPowerKw;
    const ceiling = bayCeilingKw(state, bay);
    if (bay.allocatedPowerKw > ceiling + POWER_EPSILON) {
      fail(
        2,
        `${bay.id} allocated ${round(bay.allocatedPowerKw, 3)} kW above ceiling ${round(ceiling, 3)} kW`,
      );
    }
  }
  if (totalAllocated > state.site.gridPowerKw + POWER_EPSILON) {
    fail(2, `allocated ${round(totalAllocated, 3)} kW exceeds cap ${state.site.gridPowerKw} kW`);
  }

  // 3. Delivered never exceeds requested.
  for (const sessionId of state.activeSessionIds) {
    const session = state.sessions[sessionId];
    if (!session) continue;
    if (session.deliveredKwh > session.requestedKwh + 1e-6) {
      fail(3, `session ${sessionId} delivered ${session.deliveredKwh} > requested ${session.requestedKwh}`);
    }
  }

  // 4. A faulted, repairing or closed bay never holds an active session (D19).
  for (const bay of bayList(state)) {
    const unavailable = bay.state === "faulted" || bay.state === "repairing" || !bay.isOpen;
    if (unavailable && bay.activeSessionId !== undefined) {
      fail(4, `${bay.id} is ${bay.isOpen ? bay.state : "closed"} but holds session ${bay.activeSessionId}`);
    }
  }

  // 5. SOC stays in range — on site, and at the moment of leaving.
  //    The departed half is not ceremony: SOC is written by the charging model
  //    right up to the tick a session ends, so the last value a vehicle ever
  //    held is exactly the one this check used to catch and would now miss (D39).
  for (const vehicle of Object.values(state.vehicles)) {
    if (vehicle.currentSoc < -1e-9 || vehicle.currentSoc > 1 + 1e-9) {
      fail(5, `vehicle ${vehicle.id} SOC ${vehicle.currentSoc} outside 0–1`);
    }
  }
  for (const departed of state.departedVehicles) {
    if (departed.finalSoc < -1e-9 || departed.finalSoc > 1 + 1e-9) {
      fail(5, `departed ${departed.id} left with SOC ${departed.finalSoc} outside 0–1`);
    }
  }

  // 6. Cash reconciliation for this tick.
  const expectedDelta =
    ctx.sample.revenue -
    ctx.sample.energyCost -
    ctx.sample.maintenanceCost -
    ctx.sample.opexAccrued -
    ctx.sample.capex;
  const actualDelta = state.site.economics.cash - ctx.cashAtTickStart;
  if (Math.abs(actualDelta - expectedDelta) > CASH_EPSILON) {
    fail(
      6,
      `cash moved ${round(actualDelta, 6)} but revenue−costs was ${round(expectedDelta, 6)}`,
    );
  }

  // 7. Every terminal vehicle has exactly one leave reason; funnel sums to arrivals.
  //    (The sum only closes after the end-of-run sweep; mid-run, vehicles in
  //    flight are legitimately in no bucket, so the check is one-sided here.)
  const f = state.site.metrics.funnel;
  const bucketed =
    f.rejectedSite +
    f.siteFull +
    f.abandonedQueue +
    f.interruptedByFault +
    f.completed +
    f.closedAtRunEnd;
  if (bucketed > f.arrived) {
    fail(7, `funnel buckets (${bucketed}) exceed arrivals (${f.arrived})`);
  }
  // Since D39 a terminal vehicle is moved out of `vehicles` into
  // `departedVehicles`, so the old form of this check — "a terminal vehicle has
  // a leave reason" — would pass by finding nothing to look at. Stated as the
  // two halves of that move instead, both of which can actually fail: nobody
  // terminal is left behind in `vehicles`, and nobody in `departedVehicles`
  // arrived there without a reason and a terminal outcome.
  for (const vehicle of Object.values(state.vehicles)) {
    if (vehicle.state === "left" || vehicle.state === "complete") {
      fail(7, `vehicle ${vehicle.id} is ${vehicle.state} but still in \`vehicles\``);
    }
    if (vehicle.leaveReason !== undefined) {
      fail(7, `vehicle ${vehicle.id} has a leave reason but is ${vehicle.state}`);
    }
  }
  for (const departed of state.departedVehicles) {
    if (departed.outcome !== "left" && departed.outcome !== "complete") {
      fail(7, `departed ${departed.id} has non-terminal outcome ${departed.outcome}`);
    }
  }
  // One record per departure, and no vehicle both on site and departed.
  if (new Set(state.departedVehicles.map((d) => d.id)).size !== state.departedVehicles.length) {
    fail(7, `departedVehicles holds duplicate ids`);
  }
  for (const departed of state.departedVehicles) {
    if (state.vehicles[departed.id]) {
      fail(7, `vehicle ${departed.id} is both on site and departed`);
    }
  }

  if (mode === "throw" && violations.length > 0) {
    const first = violations[0];
    throw new Error(
      `Invariant ${first?.invariant} violated at tick ${first?.tick} (${first?.atSecond}s): ${first?.message}` +
        (violations.length > 1 ? ` (+${violations.length - 1} more)` : ""),
    );
  }
  return violations;
}

/** Post-close-out check: every vehicle terminated and the funnel closes exactly. */
export function checkFinalInvariants(state: SimulationState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const push = (invariant: number, message: string): void => {
    violations.push({ invariant, message, tick: state.clock.tick, atSecond: state.clock.secondsElapsed });
  };

  // After close-out every arrival has departed, so `vehicles` must be empty and
  // `departedVehicles` must hold exactly one record per arrival. Stated as a
  // count rather than as "every vehicle is terminal" (D39): the latter is now
  // trivially true of an empty collection, and an empty collection is precisely
  // what a bug in the sweep would also produce.
  for (const vehicle of Object.values(state.vehicles)) {
    push(7, `vehicle ${vehicle.id} is still on site after close-out, as ${vehicle.state}`);
  }
  const f = state.site.metrics.funnel;
  if (state.departedVehicles.length !== f.arrived) {
    push(
      7,
      `departedVehicles (${state.departedVehicles.length}) does not match arrivals (${f.arrived})`,
    );
  }
  // The count alone cannot see a double-recorded departure masking a missing
  // one, which is the shape a sweep that visits someone twice would leave.
  const ids = new Set(state.departedVehicles.map((d) => d.id));
  if (ids.size !== state.departedVehicles.length) {
    push(7, `departedVehicles holds ${state.departedVehicles.length - ids.size} duplicate id(s)`);
  }
  const bucketed =
    f.rejectedSite +
    f.siteFull +
    f.abandonedQueue +
    f.interruptedByFault +
    f.completed +
    f.closedAtRunEnd;
  if (bucketed !== f.arrived) {
    push(7, `funnel buckets (${bucketed}) do not sum to arrivals (${f.arrived})`);
  }
  return violations;
}
