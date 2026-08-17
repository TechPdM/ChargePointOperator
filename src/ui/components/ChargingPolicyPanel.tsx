import type { ReactElement } from "react";
import { PARTIAL_CHARGE_OPTIONS } from "../../game/core/calibration.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * The charging limit (D14) — the only lever that raises the throughput
 * ceiling. Everything else redistributes it.
 *
 * Each option shows how many drivers on site it would actually cut short.
 * That is here because of OPEN-6: with every driver targeting 80%, the 90% and
 * 80% settings are exact no-ops on this scenario, and a control that silently
 * does nothing is a legibility bug. Until OPEN-6 is decided, the panel at
 * least tells the truth about it rather than hiding it.
 */
export function ChargingPolicyPanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const current = state.site.policy.partialChargeTargetSoc;

  return (
    <Panel title="Charging limit" hint="Caps how full drivers can fill up">
      <div className="limit-list" role="radiogroup" aria-label="Charging limit">
        {PARTIAL_CHARGE_OPTIONS.map((option) => {
          const active = (option ?? undefined) === current;
          const affected = option === null ? 0 : driversAffected(state, option);
          return (
            <button
              key={String(option)}
              type="button"
              role="radio"
              aria-checked={active}
              className={`limit ${active ? "is-active" : ""}`}
              onClick={() =>
                sim.act(
                  { type: "set_partial_charge_target", targetSoc: option },
                  {
                    label: "Charging limit",
                    detail: option === null ? "off" : `${Math.round(option * 100)}%`,
                  },
                )
              }
            >
              <span className="limit-value">
                {option === null ? "Off" : `${Math.round(option * 100)}%`}
              </span>
              <span className="limit-effect">
                {option === null
                  ? "drivers fill up as they like"
                  : affected === 0
                    ? "no one waiting right now"
                    : `${affected} waiting driver${affected === 1 ? "" : "s"} cut short`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="note">
        A change applies to sessions that start from here on — nobody already plugged in is cut
        short. Charging slows sharply above 80%, so capping the limit frees bays much faster than
        it loses you energy — at a busy site. Off-peak it does almost nothing, and drivers mind.
      </p>
    </Panel>
  );
}

/**
 * Drivers this limit would actually bite on: the ones still waiting.
 *
 * Deliberately excludes cars already charging. A session's `requestedKwh` is
 * frozen at `startSession`, so changing the policy never re-caps one in flight —
 * counting them overstated the effect by roughly double (5 charging against 4
 * genuinely-affected queueing drivers, at peak). Overstating the one control
 * this panel exists to tell the truth about is the same legibility bug it was
 * written to avoid.
 */
function driversAffected(state: SimulationState, limit: number): number {
  let count = 0;
  for (const vehicle of Object.values(state.vehicles)) {
    if (vehicle.state !== "queueing") continue;
    if (vehicle.demand.targetSoc > limit) count += 1;
  }
  return count;
}
