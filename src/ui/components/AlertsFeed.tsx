import type { ReactElement } from "react";
import { ALERT_THRESHOLDS } from "../../game/core/calibration.ts";
import { ALERT_COPY } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * Read off the thresholds that actually fire the alert, and off the site's own
 * supply. Hardcoding them drifted: the copy claimed 1.5 cars per bay against a
 * threshold of 1.0, and quoted 350 kW at two sites that run 250 and 300.
 */
function alertDetail(name: string, state: SimulationState): string | undefined {
  const t = ALERT_THRESHOLDS;
  switch (name) {
    case "queue_overload":
      return `More than ${t.queueOverloadPressure} car${t.queueOverloadPressure === 1 ? "" : "s"} waiting per open bay.`;
    case "low_uptime":
      return `Bays have been out of service for more than ${100 - t.lowUptimePct}% of open bay-time.`;
    case "negative_margin":
      return "Costs are outrunning takings right now.";
    case "power_saturation":
      return `The site is drawing nearly all ${state.site.gridPowerKw} kW. Nothing left to give.`;
    case "trust_collapse":
      return `Reputation has dropped below ${t.trustCollapseBelow}.`;
    default:
      return undefined;
  }
}

/**
 * Alerts raise and clear at different levels on purpose — a flapping alert
 * destroys the legibility this whole design depends on.
 *
 * Don't panic. Every one of these is recoverable.
 */
export function AlertsFeed({ state }: { state: SimulationState }): ReactElement {
  const alerts = state.site.metrics.activeAlerts;

  return (
    <Panel
      title="Attention"
      tone={alerts.length > 0 ? "warn" : undefined}
      hint={alerts.length === 0 ? undefined : `${alerts.length} live`}
    >
      {alerts.length === 0 ? (
        <p className="empty all-clear">
          <span className="all-clear-word">All clear</span>
          Nothing needs you right now.
        </p>
      ) : (
        <ul className="alert-list">
          {alerts.map((name) => (
            <li key={name}>
              <span className="alert-lamp" aria-hidden="true" />
              <span className="alert-body">
                <span className="alert-name">{ALERT_COPY[name] ?? name}</span>
                <span className="alert-detail">{alertDetail(name, state)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
