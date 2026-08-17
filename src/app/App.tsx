/**
 * The dashboard IS the site (D3/C2). There is no picture of the forecourt, so
 * the layout below carries the whole legibility burden — it follows
 * Architecture §8.1 exactly: top bar, KPI strip, controls left, diagnosis and
 * trends centre, live state right, logs along the bottom.
 */

import type { ReactElement } from "react";

import { useGameLoop } from "../ui/hooks/useGameLoop.ts";
import { useSimulation } from "../ui/hooks/useSimulation.ts";
import { roadsideHub } from "../game/scenarios/roadsideHub.ts";

import { ScenarioHeader } from "../ui/components/ScenarioHeader.tsx";
import { RunControls } from "../ui/components/RunControls.tsx";
import { KpiCardGrid } from "../ui/components/KpiCardGrid.tsx";
import { PricingControlPanel } from "../ui/components/PricingControlPanel.tsx";
import { PowerPolicyPanel } from "../ui/components/PowerPolicyPanel.tsx";
import { ChargingPolicyPanel } from "../ui/components/ChargingPolicyPanel.tsx";
import { MaintenancePanel } from "../ui/components/MaintenancePanel.tsx";
import { BayAvailabilityPanel } from "../ui/components/BayAvailabilityPanel.tsx";
import { ActiveQueueTable } from "../ui/components/ActiveQueueTable.tsx";
import { FaultsAndRepairsPanel } from "../ui/components/FaultsAndRepairsPanel.tsx";
import { DiagnosisPanel } from "../ui/components/DiagnosisPanel.tsx";
import { AlertsFeed } from "../ui/components/AlertsFeed.tsx";
import { WaitTimeTrendChart } from "../ui/components/WaitTimeTrendChart.tsx";
import { EconomicsTrendChart } from "../ui/components/EconomicsTrendChart.tsx";
import { EventLogPanel } from "../ui/components/EventLogPanel.tsx";
import { PostRunSummary } from "../ui/components/PostRunSummary.tsx";

export function App(): ReactElement {
  const sim = useSimulation(roadsideHub, "s1");
  useGameLoop(sim.state.running, sim.state.speed, sim.advance);

  const state = sim.state.sim;

  return (
    <div className="shell">
      <div className="top-bar">
        <ScenarioHeader state={state} />
        <RunControls sim={sim} />
      </div>

      {/* The board: what the site IS right now. The KPI strip answers "how is
          it going", the power bus answers "where is the capacity going", and
          the bay rank answers "what have I got" — the three things a duty
          operator glances at before touching anything. Controls, diagnosis and
          history sit below.

          Once the day is scored, every control is spent. A `fieldset` disables
          them all at once natively — including keyboard focus — while leaving
          the numbers readable, which is the whole point of the post-run
          screen. */}
      <fieldset className="board" disabled={!state.running}>
        <div className="board-thirds">
          <KpiCardGrid state={state} />
          <PowerPolicyPanel sim={sim} />
          <PricingControlPanel sim={sim} />
        </div>

        <BayAvailabilityPanel sim={sim} />
      </fieldset>

      {/* What is wrong, and what is shouting about it — read together, because
          the diagnosis explains the alerts. Both are read-only, so they sit
          outside the fieldset and stay live after the day is scored. */}
      <div className="split-row">
        <DiagnosisPanel state={state} snapshots={sim.state.snapshots} />
        <AlertsFeed state={state} />
      </div>

      <PostRunSummary state={state} comparison={sim.state.comparison} />

      <fieldset className="floor" disabled={!state.running}>
        <div className="rail rail-left">
          <ChargingPolicyPanel sim={sim} />
          <MaintenancePanel sim={sim} />
        </div>

        <div className="centre">
          <div className="chart-pair">
            <WaitTimeTrendChart state={state} snapshots={sim.state.snapshots} />
            <EconomicsTrendChart state={state} snapshots={sim.state.snapshots} />
          </div>
        </div>

        <div className="rail rail-right">
          <FaultsAndRepairsPanel sim={sim} />
          <ActiveQueueTable state={state} />
        </div>
      </fieldset>

      <EventLogPanel events={sim.state.events} actions={sim.state.actions} />
    </div>
  );
}
