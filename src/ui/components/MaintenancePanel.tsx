import type { ReactElement } from "react";
import { MAINTENANCE } from "../../game/core/calibration.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { MaintenanceLevel } from "../../game/core/types.ts";

const LEVELS: { id: MaintenanceLevel; name: string; blurb: string }[] = [
  { id: "reactive", name: "Fix on failure", blurb: "No contract. Call-outs cost more and take longer." },
  { id: "standard", name: "Standard contract", blurb: "The usual arrangement." },
  { id: "preventive", name: "Preventive", blurb: "Costs more per day. Halves faults and speeds up repairs." },
];

/**
 * Standing maintenance policy and the uptime decomposition (O3).
 *
 * This panel does **not** schedule repairs — `FaultsAndRepairsPanel` owns that
 * action. Two controls for one action makes "what did you change?"
 * unanswerable from the action history, in a build whose gate criterion is
 * legibility.
 */
export function MaintenancePanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const m = state.site.metrics;
  const level = state.site.policy.maintenanceLevel;
  const profile = MAINTENANCE[level];

  const down = m.downtimeFaultSeconds + m.downtimeRepairSeconds + m.downtimeClosedSeconds;
  const parts = [
    { key: "fault", label: "Waiting for a repair", value: m.downtimeFaultSeconds, tone: "bad" },
    { key: "repair", label: "Being repaired", value: m.downtimeRepairSeconds, tone: "info" },
    { key: "closed", label: "Closed by you", value: m.downtimeClosedSeconds, tone: "idle" },
  ];

  return (
    <Panel
      title="Maintenance"
      hint={`£${profile.standingCostPerSimDay}/day · £${profile.costPerRepair} a repair`}
    >
      <div className="level-list" role="radiogroup" aria-label="Maintenance level">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            className={`policy ${level === l.id ? "is-active" : ""}`}
            onClick={() =>
              sim.act(
                { type: "set_maintenance_level", level: l.id },
                { label: "Maintenance", detail: l.name },
              )
            }
          >
            <span className="policy-name">{l.name}</span>
            <span className="policy-blurb">{l.blurb}</span>
          </button>
        ))}
      </div>

      <div className="downtime">
        <div className="downtime-head">
          <span>Bay-time lost today</span>
          <span className="mono">{Math.round(down / 60)} min</span>
        </div>
        {down === 0 ? (
          <p className="empty">Every bay has been available all day.</p>
        ) : (
          <ul className="downtime-list">
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <li key={p.key}>
                  <span className={`swatch tone-${p.tone}`} aria-hidden="true" />
                  <span className="downtime-label">{p.label}</span>
                  <span className="mono">{Math.round(p.value / 60)} min</span>
                  <span className="downtime-share">{Math.round((p.value / down) * 100)}%</span>
                </li>
              ))}
          </ul>
        )}
        <p className="note">
          Time you closed a bay yourself doesn't count against uptime — that's a capacity decision,
          not a breakdown.
        </p>
      </div>
    </Panel>
  );
}
