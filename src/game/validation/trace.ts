/**
 * Trace mode — Architecture §9.2. Single-step execution with a per-tick state
 * diff, so "why did that happen at 12:31?" is answerable without a debugger.
 */

import { tick } from "../core/tick.ts";
import { hashState } from "../core/rng.ts";
import type { SimulationState } from "../core/types.ts";
import type { PendingLogEvent } from "../logging/schema.ts";

export interface TraceLine {
  tick: number;
  atSecond: number;
  clock: string;
  queue: number;
  charging: number;
  down: number;
  allocatedKw: number;
  trust: number;
  cash: number;
  events: string[];
  stateHash: string;
}

export function formatSimClock(seconds: number): string {
  const h = Math.floor(seconds / 3_600) % 24;
  const m = Math.floor((seconds % 3_600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function traceTick(state: SimulationState): { next: SimulationState; line: TraceLine } {
  const { state: next, events } = tick(state);
  const bays = Object.values(next.chargers);
  return {
    next,
    line: {
      tick: next.clock.tick,
      atSecond: next.clock.secondsElapsed,
      clock: formatSimClock(next.clock.secondsElapsed),
      queue: next.queue.length,
      charging: bays.filter((b) => b.state === "charging" || b.state === "allocated").length,
      down: bays.filter((b) => b.state === "faulted" || b.state === "repairing").length,
      allocatedKw: Math.round(next.site.gridPowerKw - next.site.availablePowerKw),
      trust: Math.round(next.site.metrics.trust * 10) / 10,
      cash: Math.round(next.site.economics.cash),
      events: interestingEvents(events),
      stateHash: hashState(next),
    },
  };
}

function interestingEvents(events: PendingLogEvent[]): string[] {
  return events
    .filter((e) => e.level !== "debug" && e.event_name !== "metric.snapshot")
    .map((e) => `${e.event_name}: ${e.message}`);
}

export function formatTraceLine(line: TraceLine): string {
  const head =
    `t${String(line.tick).padStart(4, " ")} ${line.clock}` +
    ` q=${String(line.queue).padStart(2, " ")}` +
    ` busy=${line.charging}` +
    ` down=${line.down}` +
    ` kW=${String(line.allocatedKw).padStart(3, " ")}` +
    ` trust=${line.trust.toFixed(1)}` +
    ` cash=£${line.cash}`;
  return line.events.length > 0 ? `${head}  | ${line.events.join(" | ")}` : head;
}
