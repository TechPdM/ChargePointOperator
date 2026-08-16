import type { ReactElement } from "react";
import { ALERT_COPY } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { SimulationState } from "../../game/core/types.ts";

const ALERT_DETAIL: Record<string, string> = {
  queue_overload: "More than one and a half cars waiting per open bay.",
  low_uptime: "Bays are out of service for a noticeable share of the day.",
  negative_margin: "Costs are outrunning takings right now.",
  power_saturation: "The site is drawing nearly all 350 kW. Nothing left to give.",
  trust_collapse: "Reputation has dropped below 40.",
};

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
                <span className="alert-detail">{ALERT_DETAIL[name]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
