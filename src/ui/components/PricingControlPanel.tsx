import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { ARCHETYPES, PRICE_MAX, PRICE_MIN } from "../../game/core/calibration.ts";
import { priceMultiplier } from "../../game/systems/arrivals.ts";
import { getActiveWave } from "../../game/core/selectors.ts";
import { ARCHETYPE_PLURAL } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { Simulation } from "../hooks/useSimulation.ts";
import type { DemandWave, VehicleArchetype } from "../../game/core/types.ts";

const MIX_KEY: Record<VehicleArchetype, keyof DemandWave> = {
  commuter: "commuterMix",
  enroute: "enrouteMix",
  panic_low_soc: "panicMix",
};

/**
 * Who refuses this price outright, and how much of the wave they are.
 *
 * The elasticity multiplier alone was badly understating price: it only thins
 * the arrival rate, while the far larger effect is drivers reaching the
 * forecourt and refusing on `maxAcceptablePricePerKwh`. Measured over 5 seeds,
 * £1.20 shows as "−62% arrivals" while sessions actually started fall 83%. Both
 * halves are now on screen; neither is multiplied into a single false-precision
 * figure, because the soft price term in `siteScore` sheds custom on top of
 * these and is not captured by either.
 */
function hardRejectors(price: number, wave: DemandWave): { names: string[]; share: number } {
  const names: string[] = [];
  let share = 0;
  for (const key of Object.keys(ARCHETYPES) as VehicleArchetype[]) {
    if (price <= ARCHETYPES[key].maxAcceptablePricePerKwh) continue;
    names.push(ARCHETYPE_PLURAL[key]);
    share += (wave[MIX_KEY[key]] as number) ?? 0;
  }
  return { names, share };
}

/**
 * Price. Writes `set_price` only — the dynamic-pricing toggle the wireframe
 * once had is cut, because no mechanic sits behind it (C5).
 *
 * There is no Apply step. Both controls send themselves the moment the player
 * lets go, which is how every other control on the board already behaves — the
 * charging limit and the power policies all commit on the click.
 */
export function PricingControlPanel({ sim }: { sim: Simulation }): ReactElement {
  const { policy } = sim.state.sim.site;
  const state = sim.state.sim;
  const [draft, setDraft] = useState(policy.pricePerKwh);
  const [fee, setFee] = useState(policy.connectionFee);
  const pushed = useRef({ price: policy.pricePerKwh, fee: policy.connectionFee });

  const wave = getActiveWave(state.clock.secondsElapsed, state.scenario.demandWaves);
  const demand = wave
    ? priceMultiplier(draft, state.scenario.referencePricePerKwh, wave.priceElasticity)
    : 1;
  const refused = wave ? hardRejectors(draft, wave) : { names: [], share: 0 };

  /**
   * Send the pair to the sim — on release, deliberately not from `onChange`.
   *
   * A drag fires `onChange` on every step, and every `set_price` is one
   * decision-marker event in the run log (C6). Committing per step would write
   * forty of them for one decision and bury the decision itself. The player
   * still watches the number and the demand hint move live off `draft`; the sim
   * hears the answer once, when the thumb is let go.
   *
   * `pushed` is what makes a stray release or blur free. While the run is paused
   * the queued action sits unapplied, so `policy` still reads the old price —
   * comparing against it would re-send the same price on every lost focus.
   */
  const commit = (price: number, connectionFee: number): void => {
    if (price === pushed.current.price && connectionFee === pushed.current.fee) return;
    pushed.current = { price, fee: connectionFee };
    sim.act(
      { type: "set_price", pricePerKwh: price, connectionFee },
      {
        label: "Price",
        detail: `£${price.toFixed(2)}/kWh, £${connectionFee.toFixed(2)} connection`,
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
            ? "arrivals unchanged"
            : `${demand > 1 ? "+" : ""}${Math.round((demand - 1) * 100)}% arrivals`}
        </span>
      </div>

      {refused.names.length > 0 ? (
        <p className="price-refusal">
          {joinNames(refused.names)} won't stop at all at this price —{" "}
          {Math.round(refused.share * 100)}% of who's arriving now.
        </p>
      ) : null}

      <input
        type="range"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={0.01}
        value={draft}
        aria-label="Price per kWh"
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => commit(draft, fee)}
        onKeyUp={() => commit(draft, fee)}
        onBlur={() => commit(draft, fee)}
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
          onBlur={() => commit(draft, fee)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft, fee);
          }}
        />
      </label>

      <p className="note">
        The slider sends itself when you let go, the fee when you leave the box. Either way it
        applies to sessions that start from here on — anyone already plugged in keeps the price they
        arrived on.
      </p>
    </Panel>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
