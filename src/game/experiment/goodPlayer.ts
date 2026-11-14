/**
 * The good-player benchmark — a scripted stand-in for a competent human.
 *
 * The D22 baseline answers "is the game too easy?": a passive operator should
 * rarely win. Nothing answered the other half, "can it be won?". This player
 * is that answer. It acts only on what the dashboard shows a person — the
 * clock and demand wave, the queue, the wait forecast and faulted bays — and
 * only through the controls a person has. It never reads the random stream or
 * a driver's hidden ceiling.
 *
 * Its behaviour is a handful of settings (`GoodPlayerSettings`) rather than one
 * fixed script, because the right play differs by site. `benchmark.ts`
 * searches those settings per site; the best found is the site's benchmark.
 *
 * See `docs/ChargePointOperator_Strategy_Analysis_2026-11-14.md` §5, item 3.
 */

import { MAINTENANCE, PRICE_MAX, PRICE_MIN } from "../core/calibration.ts";
import { bayList } from "../core/context.ts";
import { getActiveWave, getProjectedWait } from "../core/selectors.ts";
import type {
  MaintenanceLevel,
  PlayerActionDraft,
  PowerPolicy,
  ScenarioConfig,
  SimulationState,
} from "../core/types.ts";
import type { PolicyActor } from "./baselinePolicy.ts";

export interface GoodPlayerSettings {
  /** Contract taken in the first minute. The player starts on `reactive` (D63). */
  maintenance: MaintenanceLevel;
  /** Standing price as a multiple of the site's starting price. */
  priceMultiplier: number;
  /**
   * Peak markup and lull discount, as a fraction of the standing price. A peak
   * is a wave at 1.5× the day's mean arrival rate or more; a lull 0.6× or less
   * (the D55 wave-pricing thresholds).
   */
  waveSwing: number;
  /**
   * Raise the price this much (fraction of standing) while the wait forecast
   * for a new arrival is over `queueWaitSeconds`. 0 is off.
   */
  queueMarkup: number;
  /** Charging limit switched on while the forecast is over `queueWaitSeconds`. */
  peakChargeLimit: number | undefined;
  /** The forecast wait, in sim-seconds, that counts as a queue building. */
  queueWaitSeconds: number;
  powerPolicy: PowerPolicy;
  /**
   * On a contract, call the repair out at once (paying the D59 premium) rather
   * than wait for the contractor. On `reactive` every repair is called out at
   * once regardless — nobody else is coming.
   */
  callOutOnContract: boolean;
}

/** Where the search starts: the baseline's choices, plus the contract. */
export const DEFAULT_GOOD_PLAYER: GoodPlayerSettings = {
  maintenance: "standard",
  priceMultiplier: 1,
  waveSwing: 0,
  queueMarkup: 0,
  peakChargeLimit: undefined,
  queueWaitSeconds: 300,
  powerPolicy: "equal_share",
  callOutOnContract: false,
};

const PEAK_RATIO = 1.5;
const LULL_RATIO = 0.6;

function meanArrivalRate(scenario: ScenarioConfig): number {
  let arrivals = 0;
  let seconds = 0;
  for (const w of scenario.demandWaves) {
    const span = w.endSecond - w.startSecond;
    arrivals += w.arrivalRatePerMinute * (span / 60);
    seconds += span;
  }
  return seconds > 0 ? arrivals / (seconds / 60) : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function goodPlayerPolicy(settings: GoodPlayerSettings): PolicyActor {
  return (state: SimulationState): PlayerActionDraft[] => {
    const actions: PlayerActionDraft[] = [];
    const policy = state.site.policy;
    const pending = (type: PlayerActionDraft["type"]): boolean =>
      state.pendingActions.some((a) => a.type === type);

    if (policy.maintenanceLevel !== settings.maintenance && !pending("set_maintenance_level")) {
      actions.push({ type: "set_maintenance_level", level: settings.maintenance });
    }
    if (policy.powerPolicy !== settings.powerPolicy && !pending("set_power_policy")) {
      actions.push({ type: "set_power_policy", powerPolicy: settings.powerPolicy });
    }

    // Repairs. A contract that will send someone is left to it unless the
    // settings say to pay the premium and jump the wait.
    const contract = MAINTENANCE[policy.maintenanceLevel].contractResponseSeconds !== undefined;
    if (!contract || settings.callOutOnContract) {
      for (const bay of bayList(state)) {
        if (bay.state === "faulted" && bay.isOpen && !pendingRepair(state, bay.id)) {
          actions.push({ type: "schedule_repair", chargerBayId: bay.id });
        }
      }
    }

    // What the dashboard shows: the wait a car joining now would face.
    const forecast = getProjectedWait(state, state.queue.length);
    const queueBuilding = forecast > settings.queueWaitSeconds;

    // Price: standing, then the wave, then the queue.
    const standing = state.scenario.initialPricePerKwh * settings.priceMultiplier;
    let target = standing;
    const wave = getActiveWave(state.clock.secondsElapsed, state.scenario.demandWaves);
    const mean = meanArrivalRate(state.scenario);
    if (wave && mean > 0 && settings.waveSwing > 0) {
      const ratio = wave.arrivalRatePerMinute / mean;
      if (ratio >= PEAK_RATIO) target += standing * settings.waveSwing;
      else if (ratio <= LULL_RATIO) target -= standing * settings.waveSwing;
    }
    if (queueBuilding && settings.queueMarkup > 0) target += standing * settings.queueMarkup;
    target = round2(Math.min(PRICE_MAX, Math.max(PRICE_MIN, target)));
    if (!pending("set_price") && Math.abs(policy.pricePerKwh - target) > 1e-9) {
      actions.push({ type: "set_price", pricePerKwh: target });
    }

    // Charging limit while the queue builds, off once it clears.
    const wantLimit = settings.peakChargeLimit !== undefined && queueBuilding
      ? settings.peakChargeLimit
      : undefined;
    if (policy.partialChargeTargetSoc !== wantLimit && !pending("set_partial_charge_target")) {
      actions.push({ type: "set_partial_charge_target", targetSoc: wantLimit ?? null });
    }

    return actions;
  };
}

function pendingRepair(state: SimulationState, bayId: string): boolean {
  return state.pendingActions.some(
    (a) => a.type === "schedule_repair" && a.chargerBayId === bayId,
  );
}

/** Short, stable text for a settings object, for tables and logs. */
export function describeSettings(s: GoodPlayerSettings): string {
  const parts = [
    s.maintenance,
    `price×${s.priceMultiplier.toFixed(2)}`,
    s.waveSwing > 0 ? `wave±${Math.round(s.waveSwing * 100)}%` : "",
    s.queueMarkup > 0 ? `queue+${Math.round(s.queueMarkup * 100)}%` : "",
    s.peakChargeLimit !== undefined ? `limit ${Math.round(s.peakChargeLimit * 100)}%` : "",
    s.peakChargeLimit !== undefined || s.queueMarkup > 0 ? `@${Math.round(s.queueWaitSeconds / 60)}m` : "",
    s.powerPolicy === "equal_share" ? "" : s.powerPolicy,
    s.callOutOnContract && s.maintenance !== "reactive" ? "call-out" : "",
  ];
  return parts.filter(Boolean).join(" ");
}
