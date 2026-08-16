/**
 * The fixed-policy baseline — D22.
 *
 * A competent-but-passive operator, not a negligent one: £0.79 flat,
 * `standard` maintenance, `equal_share` power, all bays open, partial-charge
 * off, no upgrades — and `schedule_repair` issued on the tick a fault is
 * detected. That last bit is not decoration: whether the baseline repairs at
 * all swings its uptime between ~92% and ~98%, and that is the number D13's
 * difficulty floor is checked against.
 *
 * A played run is measured against sensible defaults. Beating negligence would
 * prove nothing.
 */

import { bayList } from "../core/context.ts";
import type { PlayerActionDraft, SimulationState } from "../core/types.ts";

export type PolicyActor = (state: SimulationState) => PlayerActionDraft[];

export const baselinePolicy: PolicyActor = (state) => {
  const actions: PlayerActionDraft[] = [];
  for (const bay of bayList(state)) {
    if (bay.state === "faulted") {
      actions.push({ type: "schedule_repair", chargerBayId: bay.id });
    }
  }
  return actions;
};

/** Does nothing at all — the "negligent operator" reference, for sweeps. */
export const passivePolicy: PolicyActor = () => [];
