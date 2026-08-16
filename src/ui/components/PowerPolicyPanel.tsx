import type { ReactElement } from "react";
import { bayList } from "../../game/core/context.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { PowerPolicy } from "../../game/core/types.ts";

const POLICIES: { id: PowerPolicy; name: string; blurb: string }[] = [
  { id: "equal_share", name: "Share equally", blurb: "Split the supply evenly across every car plugged in." },
  { id: "fast_first", name: "Big bays first", blurb: "Feed the ultra-rapid bays to their limit, then whatever's left." },
  { id: "queue_relief", name: "Finish soonest first", blurb: "Prioritise the cars closest to done, so bays free up faster." },
  { id: "manual", name: "Set it myself", blurb: "Assign kilowatts bay by bay." },
];

/**
 * Power sharing, and the **power bus** — the one picture on this dashboard.
 *
 * The site has 350 kW to give and up to 500 kW of appetite. The bus shows who
 * is drawing what, right now, against that ceiling. When it runs out of room
 * the player can see the wall rather than infer it, which is what makes
 * `power_choke` diagnosable from panels alone (C2).
 *
 * None of these policies creates kilowatts. They choose who waits.
 */
export function PowerPolicyPanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const bays = bayList(state);
  const cap = state.site.gridPowerKw;
  const allocated = cap - state.site.availablePowerKw;
  const saturated = allocated >= cap * 0.95;

  return (
    <Panel
      title="Power sharing"
      hint={
        <span className={saturated ? "hint-bad" : undefined}>
          {Math.round(allocated)} of {cap} kW
        </span>
      }
    >
      <div className={`power-bus ${saturated ? "is-saturated" : ""}`}>
        {bays.map((bay) => {
          const share = (bay.allocatedPowerKw / cap) * 100;
          if (share <= 0) return null;
          return (
            <div
              key={bay.id}
              className={`bus-seg tier-${bay.spec.type}`}
              style={{ width: `${share}%` }}
              title={`${bay.label}: ${Math.round(bay.allocatedPowerKw)} kW`}
            >
              <span className="bus-seg-label">{bay.label.replace("Bay ", "")}</span>
            </div>
          );
        })}
        <div className="bus-spare" style={{ width: `${(state.site.availablePowerKw / cap) * 100}%` }} />
      </div>
      <div className="bus-scale">
        <span>0</span>
        <span className={saturated ? "hint-bad" : undefined}>
          {saturated ? "supply fully committed" : `${Math.round(state.site.availablePowerKw)} kW spare`}
        </span>
        <span>{cap} kW</span>
      </div>

      <div className="policy-list" role="radiogroup" aria-label="Power sharing policy">
        {POLICIES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={state.site.policy.powerPolicy === p.id}
            className={`policy ${state.site.policy.powerPolicy === p.id ? "is-active" : ""}`}
            onClick={() =>
              sim.act(
                p.id === "manual"
                  ? {
                      type: "set_power_policy",
                      powerPolicy: "manual",
                      manualAllocationsKw: Object.fromEntries(
                        bays.map((b) => [b.id, Math.round(cap / bays.length)]),
                      ),
                    }
                  : { type: "set_power_policy", powerPolicy: p.id },
                { label: "Power sharing", detail: p.name },
              )
            }
          >
            <span className="policy-name">{p.name}</span>
            <span className="policy-blurb">{p.blurb}</span>
          </button>
        ))}
      </div>

      {state.site.policy.powerPolicy === "manual" ? (
        <div className="manual-grid">
          {bays.map((bay) => {
            const current = state.site.policy.manualAllocationsKw?.[bay.id] ?? 0;
            return (
              <label key={bay.id} className="manual-cell">
                <span>{bay.label}</span>
                <input
                  type="number"
                  min={0}
                  max={bay.spec.maxPowerKw}
                  step={10}
                  value={current}
                  onChange={(e) =>
                    sim.act(
                      {
                        type: "set_power_policy",
                        powerPolicy: "manual",
                        manualAllocationsKw: {
                          ...(state.site.policy.manualAllocationsKw ?? {}),
                          [bay.id]: Number(e.target.value),
                        },
                      },
                      { label: "Power sharing", detail: `${bay.label} → ${e.target.value} kW` },
                    )
                  }
                />
                <span className="unit">kW</span>
              </label>
            );
          })}
          <p className="note">
            Asking for more than {cap} kW in total scales everyone down — the supply is the supply.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
