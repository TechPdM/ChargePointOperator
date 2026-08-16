/**
 * The tick pipeline — Architecture §4.1.
 *
 * `tick()` is pure: it clones the incoming state, runs the systems over the
 * draft in pipeline order, and returns the new state plus this tick's events.
 * Same seed + same action stream ⇒ same final state hash (D4/D26).
 *
 * Ordering rules that are load-bearing, not incidental:
 *  - resolveFaultsAndRepairs detaches and finalizes the session BEFORE faulting
 *    the bay (D19), or invariant 4 fires on every fault.
 *  - applyPendingBayTransitions runs after faults, so a bay freed by an
 *    interruption can absorb a latched close or upgrade in the same tick.
 *  - detectFailureStates runs after KPIs (it reads them) and before invariants
 *    (so a detected state is in state when the sweep looks).
 */

import { applyPlayerActions } from "../actions/playerActions.ts";
import { advanceActiveSessions, completeSession } from "../systems/charging.ts";
import { applyOperatingCosts } from "../systems/economics.ts";
import { applyPendingBayTransitions, resolveFaultsAndRepairs } from "../systems/faults.ts";
import { rebalancePower } from "../systems/power.ts";
import {
  assignToIdleBaysOrQueue,
  processQueueAbandonment,
  refillIdleBaysFromQueue,
} from "../systems/queue.ts";
import { spawnArrivals } from "../systems/arrivals.ts";
import { evaluateDemandAcceptance } from "../systems/admission.ts";
import {
  checkScenarioOutcome,
  evaluateGoals,
  recomputeDerivedKPIs,
  settleAvailablePower,
  snapshotData,
  updateKPIs,
} from "../systems/scoring.ts";
import { updateTrust } from "../systems/trust.ts";
import { departVehicle } from "../systems/vehicles.ts";
import { detectAlerts, detectFailureStates } from "../validation/failureStates.ts";
import { checkInvariants, type InvariantMode } from "../validation/invariants.ts";
import { EVENT_RING_SIZE, SNAPSHOT_CADENCE_SECONDS } from "./calibration.ts";
import { dataOf, emit, emptySample, type TickContext } from "./context.ts";
import { Rng } from "./rng.ts";
import type { PendingLogEvent } from "../logging/schema.ts";
import type { SimulationState } from "./types.ts";

export interface TickResult {
  state: SimulationState;
  events: PendingLogEvent[];
}

export interface TickOptions {
  invariants?: InvariantMode | "off";
}

export function tick(state: SimulationState, options: TickOptions = {}): TickResult {
  const draft = structuredClone(state) as SimulationState;

  // Fixed timestep, always. The UI speed control changes ticks-per-real-second
  // and never the tick size — a variable timestep breaks replay on the first
  // frame-rate hiccup (D26).
  const delta = draft.scenario.tickSeconds;
  draft.clock.tick += 1;
  draft.clock.deltaSeconds = delta;
  draft.clock.secondsElapsed += delta;
  draft.clock.scenarioSecondsRemaining = Math.max(
    0,
    draft.scenario.durationSeconds - draft.clock.secondsElapsed,
  );

  const rng = new Rng(draft.rngState);
  const ctx: TickContext = {
    state: draft,
    rng,
    events: [],
    delta,
    sample: emptySample(draft.clock.secondsElapsed),
    trustDeltaRaw: 0,
    cashAtTickStart: draft.site.economics.cash,
  };

  applyPlayerActions(ctx);
  spawnArrivals(ctx);
  evaluateDemandAcceptance(ctx);
  assignToIdleBaysOrQueue(ctx);
  rebalancePower(ctx);
  advanceActiveSessions(ctx);
  resolveFaultsAndRepairs(ctx);
  applyPendingBayTransitions(ctx);
  processQueueAbandonment(ctx);
  // A bay filled from the queue this tick sits in `allocated` — plugged in,
  // drawing nothing — until the next tick's rebalance. That is what the state
  // means, and it keeps energy delivery aligned with the power split that
  // actually applied while the tick was running.
  refillIdleBaysFromQueue(ctx);
  applyOperatingCosts(ctx);
  updateTrust(ctx);
  updateKPIs(ctx);
  detectFailureStates(ctx);
  detectAlerts(ctx);
  emitSnapshot(ctx);
  if (options.invariants !== "off") checkInvariants(ctx, options.invariants ?? "throw");
  checkScenarioOutcome(ctx);

  if (draft.clock.secondsElapsed >= draft.scenario.durationSeconds && draft.running) {
    closeOutRun(ctx);
  }

  draft.rngState = rng.state;
  appendToRing(draft, ctx.events);

  return { state: draft, events: ctx.events };
}

function emitSnapshot(ctx: TickContext): void {
  const { state } = ctx;
  if (state.clock.secondsElapsed % SNAPSHOT_CADENCE_SECONDS !== 0) return;
  emit(ctx, "debug", "metric.snapshot", "Metric snapshot", {
    entity_type: "metric",
    entity_id: state.site.id,
    data: snapshotData(state),
  });
}

/**
 * D18/D19 close-out sweep. Still-charging sessions finalize as completed with
 * partial delivery recorded; still-queueing vehicles leave with `scenario_end`,
 * excluded from the abandonment numerator — running out of day is not a service
 * failure. After this, every vehicle is in exactly one funnel bucket.
 */
export function closeOutRun(ctx: TickContext): void {
  const { state } = ctx;

  for (const sessionId of [...state.activeSessionIds]) {
    const session = state.sessions[sessionId];
    if (session) completeSession(ctx, session, "scenario_end");
  }

  for (const entry of [...state.queue]) {
    const vehicle = state.vehicles[entry.vehicleId];
    if (!vehicle) continue;
    state.site.metrics.funnel.closedAtRunEnd += 1;
    departVehicle(ctx, vehicle, "scenario_end");
  }
  state.queue = [];

  // Anything still mid-decision at 24:00 (arrived this very tick) also closes out.
  for (const vehicle of Object.values(state.vehicles)) {
    if (vehicle.state === "arriving" || vehicle.state === "evaluating_site") {
      state.site.metrics.funnel.closedAtRunEnd += 1;
      departVehicle(ctx, vehicle, "scenario_end");
    }
  }

  settleAvailablePower(state);
  recomputeDerivedKPIs(state);

  const outcome = evaluateGoals(state);
  state.running = false;
  state.result = outcome.allMet ? "success" : "fail";
  state.resultReason = outcome.allMet ? "goals_met" : "goals_missed";

  emit(
    ctx,
    "info",
    outcome.allMet ? "run.completed" : "run.failed",
    outcome.allMet ? "All goals met" : "Run ended with goals unmet",
    {
      entity_type: "run",
      data: dataOf({
        ...snapshotData(state),
        goal_min_trust_met: outcome.goalsMet.minTrust,
        goal_min_operating_margin_met: outcome.goalsMet.minOperatingMargin,
        goal_max_avg_wait_met: outcome.goalsMet.maxAvgWaitSeconds,
        goal_min_sessions_met: outcome.goalsMet.minSessionsCompleted,
      }),
    },
  );
}

function appendToRing(state: SimulationState, events: PendingLogEvent[]): void {
  for (const e of events) {
    state.eventLog.push({
      atSecond: e.sim_time_seconds,
      tick: e.tick_index,
      level: e.level,
      name: e.event_name,
      message: e.message,
    });
  }
  if (state.eventLog.length > EVENT_RING_SIZE) {
    state.eventLog.splice(0, state.eventLog.length - EVENT_RING_SIZE);
  }
}
