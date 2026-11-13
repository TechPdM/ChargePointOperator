/**
 * Queue mechanics: placement, abandonment, refill. FCFS only (A3).
 */

import { archetypeName } from "../core/labels.ts";
import {
  ABANDON_MAX_PROBABILITY_PER_TICK,
  ABANDON_RAMP_SECONDS,
  TRUST,
} from "../core/calibration.ts";
import { dataOf, emit, round, type TickContext } from "../core/context.ts";
import {
  chooseBay,
  getCompatibleIdleBays,
  getProjectedWait,
} from "../core/selectors.ts";
import type { VehicleAgent } from "../core/types.ts";
import { acceptedVehicles } from "./admission.ts";
import { startSession } from "./charging.ts";
import { departVehicle } from "./vehicles.ts";

/** Accepted vehicles take a free bay, or join the queue, or are turned away. */
export function assignToIdleBaysOrQueue(ctx: TickContext): void {
  const { state } = ctx;

  for (const vehicle of acceptedVehicles(state)) {
    // D50: the free bay that suits this car, not the first in bay order.
    const bay = chooseBay(vehicle, getCompatibleIdleBays(vehicle, state));
    if (bay) {
      startSession(ctx, vehicle, bay);
      continue;
    }

    if (state.queue.length >= state.scenario.maxQueueLength) {
      state.site.metrics.funnel.siteFull += 1;
      ctx.sample.turnedAway += 1;
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

  emit(ctx, "debug", "vehicle.queue_joined", `${archetypeName(vehicle.archetype)} joined the queue`, {
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
      ctx.sample.queueAbandons += 1;
      ctx.trustDeltaRaw += TRUST.abandon;

      emit(ctx, "info", "vehicle.queue_abandoned", `${archetypeName(vehicle.archetype)} gave up waiting`, {
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
/**
 * First come, first served, and the driver at the front takes the free bay
 * that suits their car (D50) — not whichever bay happens to come first in bay
 * order. Nobody holds out for a better bay type; that variant was considered
 * and declined as too hard to read from the dashboard.
 */
export function refillIdleBaysFromQueue(ctx: TickContext): void {
  const { state } = ctx;
  while (state.queue.length > 0) {
    const entry = state.queue[0];
    if (!entry) break;
    const vehicle = state.vehicles[entry.vehicleId];
    if (!vehicle) {
      state.queue.shift();
      continue;
    }
    const bay = chooseBay(vehicle, getCompatibleIdleBays(vehicle, state));
    if (!bay) break;
    state.queue.shift();
    startSession(ctx, vehicle, bay);
  }
}
