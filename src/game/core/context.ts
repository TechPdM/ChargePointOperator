/**
 * The mutable draft a single tick works on.
 *
 * `tick()` clones state, hands the draft to the systems in pipeline order, and
 * returns the new state plus the events emitted. The input state is never
 * touched, which is what makes `state = tick(state)` pure in the sense D4 means.
 */

import type { Rng } from "./rng.ts";
import type { PendingLogEvent, LogEventName, LogLevel, LogValue } from "../logging/schema.ts";
import type { ChargerBay, SimulationState, TickSample, VehicleAgent } from "./types.ts";

export interface TickContext {
  state: SimulationState;
  rng: Rng;
  events: PendingLogEvent[];
  delta: number;
  /** Accumulates this tick's raw counters; pushed onto the ring at KPI time. */
  sample: TickSample;
  /** Trust movements requested this tick, summed and clamped at KPI time. */
  trustDeltaRaw: number;
  /** Cash before any of this tick's movements — invariant 6 reconciles against it. */
  cashAtTickStart: number;
}

export function emptySample(atSecond: number): TickSample {
  return {
    atSecond,
    openBaySeconds: 0,
    occupiedBaySeconds: 0,
    faultSeconds: 0,
    repairSeconds: 0,
    sessionsStarted: 0,
    sessionsCompleted: 0,
    sessionsCompletedWithoutFault: 0,
    queueAbandons: 0,
    startedWaitSecondsSum: 0,
    kwhDelivered: 0,
    revenue: 0,
    energyCost: 0,
    maintenanceCost: 0,
    opexAccrued: 0,
    capex: 0,
    allocatedPowerKw: 0,
    queueLength: 0,
    trustDelta: 0,
  };
}

export function emit(
  ctx: TickContext,
  level: LogLevel,
  name: LogEventName,
  message: string,
  extra: Omit<PendingLogEvent, "sim_time_seconds" | "tick_index" | "level" | "event_name" | "message"> = {},
): void {
  ctx.events.push({
    sim_time_seconds: ctx.state.clock.secondsElapsed,
    tick_index: ctx.state.clock.tick,
    level,
    event_name: name,
    message,
    ...extra,
  });
}

export function pct(fraction: number): number {
  return round(fraction * 100, 2);
}

export function round(value: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Record lookups under `noUncheckedIndexedAccess`, with a loud failure mode. */
export function mustBay(state: SimulationState, id: string): ChargerBay {
  const bay = state.chargers[id];
  if (!bay) throw new Error(`No such charger bay: ${id}`);
  return bay;
}

export function mustVehicle(state: SimulationState, id: string): VehicleAgent {
  const v = state.vehicles[id];
  if (!v) throw new Error(`No such vehicle: ${id}`);
  return v;
}

export function bayList(state: SimulationState): ChargerBay[] {
  // Roster order, not object-key order — determinism must not depend on
  // insertion order of a Record.
  return state.scenario.bays.map((entry) => mustBay(state, entry.id));
}

export function dataOf(values: Record<string, LogValue | undefined>): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
