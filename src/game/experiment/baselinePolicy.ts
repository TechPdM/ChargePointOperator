/**
 * The fixed-policy baseline — D22.
 *
 * A competent-but-passive operator, not a negligent one: £0.79 flat,
 * `standard` maintenance, `equal_share` power, all bays open, partial-charge
 * off, no upgrades — and every fault repaired. **D59:** on a contract tier the
 * contractor does that (D53) and the baseline leaves it to them rather than pay
 * the call-out premium; on `reactive` it calls the repair out on the tick the
 * fault is detected, as it always did. That last bit is not decoration: whether the baseline repairs at
 * all swings its uptime between ~92% and ~98%, and that is the number D13's
 * difficulty floor is checked against.
 *
 * A played run is measured against sensible defaults. Beating negligence would
 * prove nothing.
 */

import { MAINTENANCE } from "../core/calibration.ts";
import { bayList } from "../core/context.ts";
import type { PlayerActionDraft, SimulationState } from "../core/types.ts";

export type PolicyActor = (state: SimulationState) => PlayerActionDraft[];

export const baselinePolicy: PolicyActor = (state) => {
  const actions: PlayerActionDraft[] = [];
  // D59: a passive operator on a contract lets the contractor come.
  if (MAINTENANCE[state.site.policy.maintenanceLevel].contractResponseSeconds !== undefined) {
    return actions;
  }
  for (const bay of bayList(state)) {
    if (bay.state === "faulted") {
      actions.push({ type: "schedule_repair", chargerBayId: bay.id });
    }
  }
  return actions;
};

/** Does nothing at all — the "negligent operator" reference, for sweeps. */
export const passivePolicy: PolicyActor = () => [];
