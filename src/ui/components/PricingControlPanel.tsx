import { useState } from "react";
import type { ReactElement } from "react";
import { PRICE_MAX, PRICE_MIN } from "../../game/core/calibration.ts";
import { priceMultiplier } from "../../game/systems/arrivals.ts";
import { getActiveWave } from "../../game/core/selectors.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";

/**
 * Price. Writes `set_price` only — the dynamic-pricing toggle the wireframe
 * once had is cut, because no mechanic sits behind it (C5).
 */
export function PricingControlPanel({ sim }: { sim: Simulation }): ReactElement {
  const { policy } = sim.state.sim.site;
  const state = sim.state.sim;
  const [draft, setDraft] = useState(policy.pricePerKwh);
  const [fee, setFee] = useState(policy.connectionFee);

  const wave = getActiveWave(state.clock.secondsElapsed, state.scenario.demandWaves);
  const demand = wave
    ? priceMultiplier(draft, state.scenario.referencePricePerKwh, wave.priceElasticity)
    : 1;
  const changed = draft !== policy.pricePerKwh || fee !== policy.connectionFee;

  const apply = (): void => {
    sim.act(
      { type: "set_price", pricePerKwh: draft, connectionFee: fee },
      {
        label: "Price",
        detail: `£${draft.toFixed(2)}/kWh, £${fee.toFixed(2)} connection`,
      },
    );
  };

  return (
    <Panel title="Price" hint={`Energy costs you £${state.scenario.energyCostPerKwh.toFixed(2)}/kWh`}>
      <div className="price-readout">
        <span className="big-number">
          {draft.toFixed(2)}
          <span className="unit">£/kWh</span>
        </span>
        <span className={`demand-hint ${demand < 0.95 ? "is-down" : demand > 1.05 ? "is-up" : ""}`}>
          {demand === 1
            ? "demand unchanged"
            : `${demand > 1 ? "+" : ""}${Math.round((demand - 1) * 100)}% demand`}
        </span>
      </div>

      <input
        type="range"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={0.01}
        value={draft}
        aria-label="Price per kWh"
        onChange={(e) => setDraft(Number(e.target.value))}
      />
      <div className="range-ends">
        <span>£{PRICE_MIN.toFixed(2)}</span>
        <span>£{PRICE_MAX.toFixed(2)}</span>
      </div>

      <label className="field">
        <span>Connection fee</span>
        <input
          type="number"
          min={0}
          step={0.25}
          value={fee}
          onChange={(e) => setFee(Number(e.target.value))}
        />
      </label>

      <button type="button" className="apply" onClick={apply} disabled={!changed}>
        {changed ? "Apply price" : "Applied"}
      </button>
    </Panel>
  );
}
