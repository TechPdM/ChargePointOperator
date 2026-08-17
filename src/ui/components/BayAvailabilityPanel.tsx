import type { ReactElement } from "react";
import { bayList } from "../../game/core/context.ts";
import { CHARGER_SPECS } from "../../game/core/calibration.ts";
import { money } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { ChargerBay, ChargerState, SimulationState } from "../../game/core/types.ts";

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
/**
 * The upgrade this bay can actually buy, resolved from its **current** spec.
 *
 * Not `upgradeCosts[0]`: a site can offer more than one path (the destination
 * site sells slow_ac→rapid_dc at £18k and rapid_dc→ultrarapid at £40k), and
 * taking the first entry priced every bay at the cheapest one while the reducer
 * charged the real figure. It also gated the button on `rapid_dc`, so the seven
 * slow_ac posts had no upgrade at all despite a valid path.
 */
function upgradeFor(state: SimulationState, bay: ChargerBay) {
  return state.scenario.upgradeCosts.find((c) => c.from === bay.spec.type);
}

export function BayAvailabilityPanel({ sim }: { sim: Simulation }): ReactElement {
  const state = sim.state.sim;
  const bays = bayList(state);

  return (
    <Panel title="Bays" hint={`${bays.filter((b) => b.isOpen).length} of ${bays.length} open`}>
      <ul className="bay-rank">
        {bays.map((bay) => (
          <BayRow key={bay.id} bay={bay} sim={sim} />
        ))}
      </ul>
      <p className="note">
        Closing a bay that's in use waits for the car to finish — nobody gets unplugged. An upgrade
        is charged straight away and fitted when the bay next frees.
      </p>
    </Panel>
  );
}

function BayRow({ bay, sim }: { bay: ChargerBay; sim: Simulation }): ReactElement {
  const status = STATE_COPY[bay.state];
  const pending =
    bay.closeRequested && bay.pendingUpgradeType
      ? "closing and upgrading when it frees"
      : bay.closeRequested
        ? "closing when it frees"
        : bay.pendingUpgradeType
          ? "upgrading when it frees"
          : null;
  const upgrade = bay.pendingUpgradeType ? undefined : upgradeFor(sim.state.sim, bay);
  const upgradeKw = upgrade ? CHARGER_SPECS[upgrade.to].maxPowerKw : 0;
  const affordable = upgrade !== undefined && sim.state.sim.site.economics.cash >= upgrade.capexCost;

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
        {upgrade ? (
          <button
            type="button"
            className="mini"
            disabled={!affordable}
            title={
              affordable
                ? `Fit a ${upgradeKw} kW charger for ${money(upgrade.capexCost)}`
                : `Not enough cash — this costs ${money(upgrade.capexCost)}`
            }
            onClick={() =>
              sim.act(
                { type: "upgrade_charger", chargerBayId: bay.id, newType: upgrade.to },
                {
                  label: "Upgrade",
                  detail: `${bay.label} to ${upgradeKw} kW · ${money(upgrade.capexCost)}`,
                },
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
