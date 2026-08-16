/**
 * The three archetypes (O6). All three are needed for the dominant-strategy
 * gate test: if one policy wins on a corridor hub, a commuter hub AND a
 * destination site, it is dominant and criterion 2 has failed.
 */

import { commuterHub } from "./commuterHub.ts";
import { destinationSite } from "./destinationSite.ts";
import { roadsideHub } from "./roadsideHub.ts";
import type { ScenarioConfig } from "../core/types.ts";

export { commuterHub, destinationSite, roadsideHub };

export const ALL_SCENARIOS: ScenarioConfig[] = [roadsideHub, commuterHub, destinationSite];

export const scenarios: Record<string, ScenarioConfig> = Object.fromEntries(
  ALL_SCENARIOS.map((s) => [s.id, s]),
);

/** Short names for the CLI: `--scenario commuter`. */
export function findScenario(key: string): ScenarioConfig {
  const direct = scenarios[key];
  if (direct) return direct;
  const match = ALL_SCENARIOS.find((s) => s.id.startsWith(key) || s.archetype.startsWith(key));
  if (!match) {
    throw new Error(`Unknown scenario "${key}". Try: ${ALL_SCENARIOS.map((s) => s.id).join(", ")}`);
  }
  return match;
}
