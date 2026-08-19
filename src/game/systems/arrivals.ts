/**
 * Arrivals — Architecture §4.3 / §6, as amended by D21.
 *
 * The wave table gives ABSOLUTE rates and each wave's `priceElasticity` IS the
 * coefficient. There is no `baseDemand` and no second global elasticity.
 */

import { archetypeName } from "../core/labels.ts";
import {
  ARCHETYPES,
  DETOUR_PREMIUM_MAX,
  PRICE_MULTIPLIER_MAX,
  PRICE_MULTIPLIER_MIN,
} from "../core/calibration.ts";
import { dataOf, emit, round, type TickContext } from "../core/context.ts";
import { getActiveWave } from "../core/selectors.ts";
import type { DemandWave, VehicleAgent, VehicleArchetype } from "../core/types.ts";

export function priceMultiplier(
  price: number,
  referencePrice: number,
  waveElasticity: number,
): number {
  const raw = 1 - (waveElasticity * (price - referencePrice)) / referencePrice;
  return Math.min(PRICE_MULTIPLIER_MAX, Math.max(PRICE_MULTIPLIER_MIN, raw));
}

/**
 * What a driver will pay above their base price, because the alternative costs
 * them a detour (D42).
 *
 * The trade is the driver's own: my alternative is `detourMinutes` away, that
 * time is worth `valueOfTimePerHour` to me, and I am spreading that cost over
 * the `requestedKwh` I came here to buy. Above this premium, driving on is
 * cheaper than paying.
 *
 * Value of time is per archetype and comes from the DfT VTT study (Table 5.1,
 * 2014 perceived prices) — see the calibration sheet §3.
 */
export function detourPremiumPerKwh(
  detourMinutes: number,
  valueOfTimePerHour: number,
  requestedKwh: number,
): number {
  if (detourMinutes <= 0) return 0;
  // A driver who wants no energy has nothing to spread the cost over; the clamp
  // is the only sane answer and it keeps the function total.
  if (requestedKwh <= 0) return DETOUR_PREMIUM_MAX;
  const raw = ((detourMinutes / 60) * valueOfTimePerHour) / requestedKwh;
  return Math.min(DETOUR_PREMIUM_MAX, raw);
}

export function spawnArrivals(ctx: TickContext): void {
  const { state } = ctx;
  const wave = getActiveWave(state.clock.secondsElapsed, state.scenario.demandWaves);
  if (!wave) return;

  const multiplier = priceMultiplier(
    state.site.policy.pricePerKwh,
    state.scenario.referencePricePerKwh,
    wave.priceElasticity,
  );
  // One tick is one sim-minute, so the per-minute rate is the Poisson mean.
  const lambda = wave.arrivalRatePerMinute * multiplier * (ctx.delta / 60);
  const count = ctx.rng.poisson(lambda);

  for (let i = 0; i < count; i++) {
    const vehicle = createVehicle(ctx, wave);
    state.vehicles[vehicle.id] = vehicle;
    state.site.metrics.funnel.arrived += 1;
    emit(ctx, "debug", "vehicle.arrived", `${archetypeName(vehicle.archetype)} arrived`, {
      entity_type: "vehicle",
      entity_id: vehicle.id,
      data: dataOf({
        archetype: vehicle.archetype,
        wave_id: wave.id,
        soc_pct: round(vehicle.currentSoc * 100, 1),
        battery_capacity_kwh: round(vehicle.batteryCapacityKwh, 1),
        max_charge_rate_kw: round(vehicle.maxChargeRateKw, 1),
        requested_kwh: round(vehicle.demand.requestedKwh, 2),
        // D42 — the legibility half: "nearest alternative 25 min, will pay up
        // to £0.97" is a readable reason for a driver to have driven on.
        detour_minutes: round(vehicle.detourMinutes, 1),
        max_acceptable_price_per_kwh: round(vehicle.demand.maxAcceptablePricePerKwh, 3),
      }),
    });
  }
}

function pickArchetype(ctx: TickContext, wave: DemandWave): VehicleArchetype {
  return ctx.rng.pick<VehicleArchetype>([
    ["commuter", wave.commuterMix],
    ["enroute", wave.enrouteMix],
    ["panic_low_soc", wave.panicMix],
  ]);
}

function createVehicle(ctx: TickContext, wave: DemandWave): VehicleAgent {
  const { state } = ctx;
  const archetype = pickArchetype(ctx, wave);
  const p = ARCHETYPES[archetype];

  const batteryCapacityKwh = ctx.rng.range(p.batteryKwh[0], p.batteryKwh[1]);
  const maxChargeRateKw = ctx.rng.range(p.maxChargeRateKw[0], p.maxChargeRateKw[1]);
  const currentSoc = ctx.rng.range(p.arrivalSoc[0], p.arrivalSoc[1]);
  // D42: this driver's own alternative. Drawn per vehicle rather than fixed per
  // site, because direction of approach decides whether the next rapid is ahead
  // of you or behind you — which is what makes the refusal a curve and not the
  // shared cliff every site used to share.
  const [detourMin, detourMax] = state.scenario.detourMinutes;
  const detourMinutes = ctx.rng.range(detourMin, detourMax);
  // Site type shapes who turns up and how they behave once they do.
  const urgencyScore = Math.min(
    1,
    ctx.rng.range(p.urgency[0], p.urgency[1]) * (state.scenario.urgencyMultiplier ?? 1),
  );
  const patienceSeconds = Math.round(
    p.patienceSeconds * (state.scenario.patienceMultiplier ?? 1),
  );

  // Driver-intent demand. The site's partial-charge policy may reduce this at
  // session start (D14); this figure is what they wanted.
  const requestedKwh = Math.max(0, (p.targetSoc - currentSoc) * batteryCapacityKwh);
  // D42: the base is what they would pay with a competitor right there; the
  // detour is what buys the premium on top.
  const maxAcceptablePricePerKwh =
    p.maxAcceptablePriceBase +
    detourPremiumPerKwh(detourMinutes, p.valueOfTimePerHour, requestedKwh);

  const id = `v-${state.nextVehicleSeq}`;
  state.nextVehicleSeq += 1;

  return {
    id,
    archetype,
    state: "arriving",
    batteryCapacityKwh,
    maxChargeRateKw,
    currentSoc,
    arrivalSecond: state.clock.secondsElapsed,
    detourMinutes,
    urgencyScore,
    priceSensitivity: p.priceSensitivity,
    waitSensitivity: p.waitSensitivity,
    demand: {
      targetSoc: p.targetSoc,
      requestedKwh,
      maxAcceptablePricePerKwh,
      patienceSeconds,
    },
  };
}
