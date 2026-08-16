/**
 * Human-readable names for the event `message` field.
 *
 * The split is deliberate: `data` keeps the canonical machine token
 * (`panic_low_soc`), because that is what analysis and replay read; `message`
 * is prose a person sees in the event log, and internal identifiers leaking
 * into it is a legibility bug — the playtest protocol treats every question a
 * tester has to ask as exactly that.
 */

import type { VehicleArchetype } from "./types.ts";

export const ARCHETYPE_NAME: Record<VehicleArchetype, string> = {
  commuter: "Commuter",
  enroute: "En-route driver",
  panic_low_soc: "Low-battery driver",
};

export function archetypeName(archetype: VehicleArchetype): string {
  return ARCHETYPE_NAME[archetype];
}
