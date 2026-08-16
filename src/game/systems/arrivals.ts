/**
 * Arrivals — Architecture §4.3 / §6, as amended by D21.
 *
 * The wave table gives ABSOLUTE rates and each wave's `priceElasticity` IS the
 * coefficient. There is no `baseDemand` and no second global elasticity.
 */

import { archetypeName } from "../core/labels.ts";
import {
  ARCHETYPES,
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
  // Site type shapes who turns up and how they behave once they do.
  const urgencyScore = Math.min(
    1,
    ctx.rng.range(p.urgency[0], p.urgency[1]) * (state.scenario.urgencyMultiplier ?? 1),
  );
  const patienceSeconds = Math.round(
    p.patienceSeconds * (state.scenario.patienceMultiplier ?? 1),
  );

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
    urgencyScore,
    priceSensitivity: p.priceSensitivity,
    waitSensitivity: p.waitSensitivity,
    demand: {
      targetSoc: p.targetSoc,
      // Driver-intent demand. The site's partial-charge policy may reduce this
      // at session start (D14); this figure is what they wanted.
      requestedKwh: Math.max(0, (p.targetSoc - currentSoc) * batteryCapacityKwh),
      maxAcceptablePricePerKwh: p.maxAcceptablePricePerKwh,
      patienceSeconds,
    },
  };
}
