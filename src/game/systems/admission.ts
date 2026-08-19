/**
 * Admission — the siteScore test (D21), with the price reference taken from the
 * site rather than the archetype (D43).
 *
 * The per-archetype price/wait sensitivities are the whole point of this
 * formula: before D21 they were calibrated and read by nothing, so all three
 * archetypes admitted identically. Commuters shed first (~9 sim-min of expected
 * wait), en-route tolerate a real queue, panic arrivals effectively never leave.
 */

import { archetypeName } from "../core/labels.ts";
import {
  ACCEPT_THRESHOLD,
  SITE_SCORE,
  TRUST,
  WAIT_PERCEPTION_NOISE,
} from "../core/calibration.ts";
import { dataOf, emit, round, type TickContext } from "../core/context.ts";
import { getProjectedWait } from "../core/selectors.ts";
import type { SimulationState, VehicleAgent } from "../core/types.ts";
import { departVehicle } from "./vehicles.ts";

/**
 * The soft admission test.
 *
 * `referencePricePerKwh` is the **site's** (D43), not the archetype's. It used
 * to be the archetype's, which made this whole test site-blind on price: a
 * commuter judged £0.85 identically at a motorway services and a garden centre,
 * and every site's margin optimum landed in the same place as a result.
 *
 * A reference price is what charging costs round here — a property of the
 * market. How much a driver minds paying over it is `priceSensitivity` — a
 * property of the driver. The two were conflated; separating them is the whole
 * change, and archetype character is unharmed because it rides on the
 * sensitivity coefficient (0.7 commuter · 0.4 en-route · 0.1 panic).
 */
export function siteScore(
  vehicle: VehicleAgent,
  price: number,
  referencePricePerKwh: number,
  expectedWaitSeconds: number,
  trust: number,
): number {
  return (
    SITE_SCORE.a * vehicle.urgencyScore -
    SITE_SCORE.b * vehicle.waitSensitivity * (expectedWaitSeconds / 600) -
    SITE_SCORE.c * vehicle.priceSensitivity * ((price - referencePricePerKwh) / 0.1) +
    SITE_SCORE.d * ((trust - 50) / 25)
  );
}

/** Vehicles that arrived this tick and are still deciding. */
export function evaluateDemandAcceptance(ctx: TickContext): void {
  const { state } = ctx;
  const arriving = arrivingVehicles(state);

  for (const vehicle of arriving) {
    vehicle.state = "evaluating_site";
    const trueWait = getProjectedWait(state, state.queue.length);
    // A4/D31: the driver judges the wait they can see, and they misjudge it.
    // Perfect information made every arrival read the true wait and drive on,
    // which capped the queue and left abandonment doing no work at all.
    const perceivedWait =
      trueWait * ctx.rng.range(1 - WAIT_PERCEPTION_NOISE, 1 + WAIT_PERCEPTION_NOISE);
    vehicle.expectedWaitSeconds = perceivedWait;

    const score = siteScore(
      vehicle,
      state.site.policy.pricePerKwh,
      state.scenario.referencePricePerKwh,
      perceivedWait,
      state.site.metrics.trust,
    );
    const priceRejected = state.site.policy.pricePerKwh > vehicle.demand.maxAcceptablePricePerKwh;
    const accepted = score >= ACCEPT_THRESHOLD && !priceRejected;

    if (!accepted) {
      state.site.metrics.funnel.rejectedSite += 1;
      ctx.trustDeltaRaw += TRUST.priceRejection;
      emit(ctx, "debug", "vehicle.site_rejected", `${archetypeName(vehicle.archetype)} drove on`, {
        entity_type: "vehicle",
        entity_id: vehicle.id,
        data: dataOf({
          site_score: round(score, 3),
          accept_threshold: ACCEPT_THRESHOLD,
          expected_wait_seconds: round(perceivedWait, 0),
          true_wait_seconds: round(trueWait, 0),
          price_per_kwh: round(state.site.policy.pricePerKwh, 2),
          reference_price_per_kwh: round(state.scenario.referencePricePerKwh, 2),
          hard_price_reject: priceRejected,
          archetype: vehicle.archetype,
        }),
      });
      departVehicle(ctx, vehicle, "reject_site");
      continue;
    }

    emit(ctx, "debug", "vehicle.site_accepted", `${archetypeName(vehicle.archetype)} pulled in`, {
      entity_type: "vehicle",
      entity_id: vehicle.id,
      data: dataOf({
        site_score: round(score, 3),
        expected_wait_seconds: round(perceivedWait, 0),
        true_wait_seconds: round(trueWait, 0),
        archetype: vehicle.archetype,
      }),
    });
  }
}

export function arrivingVehicles(state: SimulationState): VehicleAgent[] {
  const out: VehicleAgent[] = [];
  // Iterate in creation order so admission is stable under any Record ordering.
  for (let seq = 1; seq < state.nextVehicleSeq; seq++) {
    const v = state.vehicles[`v-${seq}`];
    if (v && v.state === "arriving") out.push(v);
  }
  return out;
}

/** Vehicles that passed admission this tick and still need placing. */
export function acceptedVehicles(state: SimulationState): VehicleAgent[] {
  const out: VehicleAgent[] = [];
  for (let seq = 1; seq < state.nextVehicleSeq; seq++) {
    const v = state.vehicles[`v-${seq}`];
    if (v && v.state === "evaluating_site") out.push(v);
  }
  return out;
}
