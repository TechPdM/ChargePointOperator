import type { ReactElement } from "react";
import { bayList } from "../../game/core/context.ts";
import { MAINTENANCE } from "../../game/core/calibration.ts";
import { minutes, money } from "../format.ts";
import { Empty, Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";

const FAULT_COPY: Record<string, string> = {
  connector_fault: "Connector fault",
  power_module_fault: "Power module fault",
  cooling_fault: "Cooling fault",
  software_fault: "Software fault",
  unknown: "Unknown fault",
};

/**
 * The sole owner of `schedule_repair` (Architecture §8.3).
 *
 * A faulted bay waits **indefinitely** until a repair is called in — repairs
 * are never automatic, which is the entire point of the maintenance mechanic.
 * So this panel has to make an unrepaired bay impossible to miss.
 */
export function FaultsAndRepairsPanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const now = state.clock.secondsElapsed;
  const down = bayList(state).filter((b) => b.state === "faulted" || b.state === "repairing");
  const waiting = down.filter((b) => b.state === "faulted");
  const cost = MAINTENANCE[state.site.policy.maintenanceLevel].costPerRepair;

  return (
    <Panel
      title="Faults"
      tone={waiting.length > 0 ? "bad" : down.length > 0 ? "warn" : undefined}
      hint={down.length > 0 ? `${down.length} bay${down.length === 1 ? "" : "s"} down` : undefined}
    >
      {down.length === 0 ? (
        <Empty>All {state.site.maxBays} bays healthy.</Empty>
      ) : (
        <ul className="fault-list">
          {down.map((bay) => {
            const isWaiting = bay.state === "faulted";
            const since = now - (bay.faultedAtSecond ?? now);
            const remaining = (bay.repairDueAtSecond ?? now) - now;
            return (
              <li key={bay.id} className={isWaiting ? "is-waiting" : "is-repairing"}>
                <div className="fault-head">
                  <span className="fault-bay">{bay.label}</span>
                  <span className="fault-kind">{FAULT_COPY[bay.faultCategory ?? "unknown"]}</span>
                </div>
                <div className="fault-meta">
                  {isWaiting ? (
                    <>
                      <span className="fault-age">
                        Out of service {minutes(since)} min — nobody is fixing it
                      </span>
                      <button
                        type="button"
                        className="apply compact"
                        onClick={() =>
                          sim.act(
                            { type: "schedule_repair", chargerBayId: bay.id },
                            { label: "Repair", detail: `${bay.label} · ${money(cost)}` },
                          )
                        }
                      >
                        Call out a repair · {money(cost)}
                      </button>
                    </>
                  ) : (
                    <span className="fault-age">
                      Repair under way — back in {minutes(Math.max(0, remaining))} min
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fault-tally">
        <span>Sessions cut short today</span>
        <span className="mono">{state.site.metrics.funnel.interruptedByFault}</span>
      </div>
    </Panel>
  );
}
