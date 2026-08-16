import type { ReactElement } from "react";
import { bayList } from "../../game/core/context.ts";
import { money } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { ChargerBay, ChargerState } from "../../game/core/types.ts";

const STATE_COPY: Record<ChargerState, { label: string; tone: string }> = {
  idle: { label: "Free", tone: "idle" },
  allocated: { label: "Plugged in", tone: "info" },
  charging: { label: "Charging", tone: "ok" },
  faulted: { label: "Faulted", tone: "bad" },
  repairing: { label: "Repairing", tone: "info" },
};

/**
 * The bay rank: open/close and upgrade. Both are deferred on a busy bay (D19),
 * so a latched change **must** be surfaced as pending — otherwise a player
 * clicks close, sees nothing happen, and has found a legibility bug rather
 * than a mechanic. The playtest protocol watches for exactly this.
 */
export function BayAvailabilityPanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const bays = bayList(state);
  const upgradeCost = state.scenario.upgradeCosts[0];

  return (
    <Panel title="Bays" hint={`${bays.filter((b) => b.isOpen).length} of ${bays.length} open`}>
      <ul className="bay-rank">
        {bays.map((bay) => (
          <BayRow key={bay.id} bay={bay} sim={sim} upgradeCost={upgradeCost?.capexCost ?? 0} />
        ))}
      </ul>
      <p className="note">
        Closing a bay that's in use waits for the car to finish — nobody gets unplugged. An upgrade
        is charged straight away and fitted when the bay next frees.
      </p>
    </Panel>
  );
}

function BayRow({
  bay,
  sim,
  upgradeCost,
}: {
  bay: ChargerBay;
  sim: Simulation;
  upgradeCost: number;
}): ReactElement {
  const status = STATE_COPY[bay.state];
  const pending =
    bay.closeRequested && bay.pendingUpgradeType
      ? "closing and upgrading when it frees"
      : bay.closeRequested
        ? "closing when it frees"
        : bay.pendingUpgradeType
          ? "upgrading when it frees"
          : null;
  const canUpgrade = bay.spec.type === "rapid_dc" && !bay.pendingUpgradeType;
  const affordable = sim.state.sim.site.economics.cash >= upgradeCost;

  return (
    <li className={`bay ${bay.isOpen ? "" : "is-closed"}`}>
      <span className={`bay-lamp tone-${bay.isOpen ? status.tone : "idle"}`} aria-hidden="true" />
      <span className="bay-name">{bay.label}</span>
      <span className={`bay-tier tier-${bay.spec.type}`}>{bay.spec.maxPowerKw} kW</span>
      <span className="bay-state">{bay.isOpen ? status.label : "Closed"}</span>
      <span className="bay-draw mono">
        {bay.allocatedPowerKw > 0 ? `${Math.round(bay.allocatedPowerKw)} kW` : "—"}
      </span>

      <span className="bay-actions">
        <button
          type="button"
          className="mini"
          onClick={() =>
            sim.act(
              { type: "toggle_bay_group", bayIds: [bay.id], open: !bay.isOpen },
              { label: "Bays", detail: `${bay.label} ${bay.isOpen ? "closed" : "opened"}` },
            )
          }
        >
          {bay.isOpen ? "Close" : "Open"}
        </button>
        {canUpgrade ? (
          <button
            type="button"
            className="mini"
            disabled={!affordable}
            title={
              affordable
                ? `Fit a 150 kW charger for ${money(upgradeCost)}`
                : `Not enough cash — this costs ${money(upgradeCost)}`
            }
            onClick={() =>
              sim.act(
                { type: "upgrade_charger", chargerBayId: bay.id, newType: "ultrarapid_dc" },
                { label: "Upgrade", detail: `${bay.label} to 150 kW · ${money(upgradeCost)}` },
              )
            }
          >
            Upgrade
          </button>
        ) : null}
      </span>

      {pending ? <span className="bay-pending">Pending — {pending}</span> : null}
    </li>
  );
}
