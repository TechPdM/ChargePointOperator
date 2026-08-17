/**
 * Display formatting. One rule, applied everywhere: **every number carries its
 * unit**, and the unit is set smaller and dimmer than the value. Numerals are
 * tabular — a figure that changes five times a second must not also jitter.
 */

import type { SimulationState, VehicleArchetype } from "../game/core/types.ts";

/** 24-hour sim clock — the scenario is one compressed day (D8). */
export function simClock(seconds: number): string {
  const total = Math.floor(seconds);
  // The end of the day reads 24:00, not 00:00 — wrapping it makes a finished
  // run look like a reset one.
  const rawHours = Math.floor(total / 3_600);
  const h = rawHours === 24 ? 24 : rawHours % 24;
  const m = Math.floor((total % 3_600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function money(value: number, dp = 0): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}£${Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

export function minutes(seconds: number): string {
  return (seconds / 60).toFixed(1);
}

export function pct(value: number, dp = 0): string {
  return value.toFixed(dp);
}

export const ARCHETYPE_LABEL: Record<VehicleArchetype, string> = {
  commuter: "Commuter",
  enroute: "En route",
  panic_low_soc: "Low battery",
};

/** For copy that talks about a group of drivers rather than one in a table row. */
export const ARCHETYPE_PLURAL: Record<VehicleArchetype, string> = {
  commuter: "Commuters",
  enroute: "En-route drivers",
  panic_low_soc: "Low-battery drivers",
};

export const ARCHETYPE_SHORT: Record<VehicleArchetype, string> = {
  commuter: "COM",
  enroute: "ENR",
  panic_low_soc: "LOW",
};

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

/** Status colours are reserved for state, never reused as chart series (Part M). */
export function toneFor(value: number, good: number, bad: number): Tone {
  const rising = good > bad;
  if (rising) return value >= good ? "ok" : value <= bad ? "bad" : "warn";
  return value <= good ? "ok" : value >= bad ? "bad" : "warn";
}

export function waveName(state: SimulationState): string {
  const now = state.clock.secondsElapsed;
  const wave = state.scenario.demandWaves.find(
    (w) => now >= w.startSecond && now < w.endSecond,
  );
  return wave?.id ?? "—";
}

/** Queue pressure is queue length per open bay — 4 waiting means different things at 6 bays vs 2. */
export function queuePressureOf(state: SimulationState): number {
  const open = Object.values(state.chargers).filter((b) => b.isOpen).length;
  return open === 0 ? state.queue.length : state.queue.length / open;
}

/**
 * The share of the day's *demand* that has already arrived — not the share of
 * its clock.
 *
 * Cumulative goals are scored at midnight, so a card has to answer "am I on
 * track?" mid-run. Judging that against elapsed time would mark the site
 * "behind" all through the small hours, when there is nothing to be behind on;
 * the wave table says 00:00–05:00 carries barely 3% of the day's arrivals.
 */
export function demandFractionElapsed(state: SimulationState): number {
  const now = state.clock.secondsElapsed;
  let total = 0;
  let soFar = 0;
  for (const wave of state.scenario.demandWaves) {
    const minutes = (wave.endSecond - wave.startSecond) / 60;
    total += wave.arrivalRatePerMinute * minutes;
    const elapsed = Math.min(Math.max(0, now - wave.startSecond), wave.endSecond - wave.startSecond);
    soFar += wave.arrivalRatePerMinute * (elapsed / 60);
  }
  return total > 0 ? soFar / total : 0;
}

export const FAILURE_STATE_COPY: Record<string, { title: string; reads: string }> = {
  queue_collapse: {
    title: "Queue collapse",
    reads: "More people are giving up than getting served.",
  },
  power_choke: {
    title: "Power choke",
    reads: "The grid cap, not the bays, is the wall.",
  },
  reliability_spiral: {
    title: "Reliability spiral",
    reads: "The site is falling apart faster than it's fixed.",
  },
  margin_trap: {
    title: "Margin trap",
    reads: "You spent capital and it bought nothing.",
  },
  trust_crash: {
    title: "Trust crash",
    reads: "Reputation is in a downward spiral.",
  },
};

export const ALERT_COPY: Record<string, string> = {
  queue_overload: "Queue overloaded",
  low_uptime: "Uptime below 90%",
  negative_margin: "Losing money right now",
  power_saturation: "Grid cap saturated",
  trust_collapse: "Trust collapsing",
};
