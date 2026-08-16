/**
 * Queue mechanics: placement, abandonment, refill. FCFS only (A3).
 */

import {
  ABANDON_MAX_PROBABILITY_PER_TICK,
  ABANDON_RAMP_SECONDS,
  TRUST,
} from "../core/calibration.ts";
import { bayList, dataOf, emit, round, type TickContext } from "../core/context.ts";
import { getCompatibleIdleBays, getProjectedWait, isAssignable, isCompatible } from "../core/selectors.ts";
import type { VehicleAgent } from "../core/types.ts";
import { acceptedVehicles } from "./admission.ts";
import { startSession } from "./charging.ts";
import { departVehicle } from "./vehicles.ts";

/** Accepted vehicles take a free bay, or join the queue, or are turned away. */
export function assignToIdleBaysOrQueue(ctx: TickContext): void {
  const { state } = ctx;

  for (const vehicle of acceptedVehicles(state)) {
    const free = getCompatibleIdleBays(vehicle, state);
    const bay = free[0];
    if (bay) {
      startSession(ctx, vehicle, bay);
      continue;
    }

    if (state.queue.length >= state.scenario.maxQueueLength) {
      state.site.metrics.funnel.siteFull += 1;
      departVehicle(ctx, vehicle, "site_full");
      continue;
    }

    enqueue(ctx, vehicle);
  }
}

export function enqueue(ctx: TickContext, vehicle: VehicleAgent): void {
  const { state } = ctx;
  const predicted = getProjectedWait(state, state.queue.length);
  vehicle.state = "queueing";
  vehicle.queuedAtSecond = state.clock.secondsElapsed;
  state.queue.push({
    vehicleId: vehicle.id,
    queuedAtSecond: state.clock.secondsElapsed,
    predictedWaitSeconds: predicted,
    // A5: universal compatibility for now; this is the seam where a CCS/AC
    // split would land.
    preferredChargerTypes: ["rapid_dc", "ultrarapid_dc"],
  });
  state.site.metrics.funnel.queueJoined += 1;

  emit(ctx, "debug", "vehicle.queue_joined", `${vehicle.archetype} joined the queue`, {
    entity_type: "vehicle",
    entity_id: vehicle.id,
    data: dataOf({
      queue_length: state.queue.length,
      predicted_wait_seconds: round(predicted, 0),
      archetype: vehicle.archetype,
    }),
  });
}

export function abandonProbability(waitedSeconds: number, patienceSeconds: number): number {
  if (waitedSeconds < patienceSeconds) return 0;
  const over = waitedSeconds - patienceSeconds;
  const ramp = Math.min(1, over / ABANDON_RAMP_SECONDS);
  return ramp * ABANDON_MAX_PROBABILITY_PER_TICK;
}

export function processQueueAbandonment(ctx: TickContext): void {
  const { state } = ctx;
  const staying: typeof state.queue = [];

  for (const entry of state.queue) {
    const vehicle = state.vehicles[entry.vehicleId];
    if (!vehicle) continue;
    const waited = state.clock.secondsElapsed - entry.queuedAtSecond;
    const p = abandonProbability(waited, vehicle.demand.patienceSeconds);

    if (p > 0 && ctx.rng.bool(p)) {
      state.site.metrics.funnel.abandonedQueue += 1;
      state.site.metrics.sessionsAbandoned += 1;
      ctx.sample.queueAbandons += 1;
      ctx.trustDeltaRaw += TRUST.abandon;

      emit(ctx, "info", "vehicle.queue_abandoned", `${vehicle.archetype} gave up waiting`, {
        entity_type: "vehicle",
        entity_id: vehicle.id,
        data: dataOf({
          waited_seconds: round(waited, 0),
          patience_seconds: vehicle.demand.patienceSeconds,
          queue_length: state.queue.length,
          archetype: vehicle.archetype,
        }),
      });
      departVehicle(ctx, vehicle, "queue_abandon");
      continue;
    }
    staying.push(entry);
  }

  state.queue = staying;
}

/** FCFS: the front of the queue takes the first bay it can use. */
export function refillIdleBaysFromQueue(ctx: TickContext): void {
  const { state } = ctx;
  for (const bay of bayList(state)) {
    if (!isAssignable(bay)) continue;
    const index = state.queue.findIndex((entry) => {
      const vehicle = state.vehicles[entry.vehicleId];
      return vehicle !== undefined && isCompatible(vehicle, bay);
    });
    if (index === -1) break;
    const entry = state.queue[index];
    if (!entry) break;
    const vehicle = state.vehicles[entry.vehicleId];
    if (!vehicle) break;
    state.queue.splice(index, 1);
    startSession(ctx, vehicle, bay);
  }
}
