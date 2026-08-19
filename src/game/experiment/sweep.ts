/**
 * Sensitivity sweeps — Plan Phase 3, Architecture §9.3, Calibration §8.
 *
 * A sweep runs one parameter axis across a grid of values, N seeds per value,
 * and reports each KPI as a mean with p10/p90. The point is not the numbers
 * themselves but their **direction**: Calibration §8 states what each input is
 * supposed to do to each output, and
 *
 *   > a flat or inverted gradient is a finding-killer: stop and fix before
 *   > believing anything.
 *
 * So the harness scores the gradient as well as printing it. A sweep that
 * merely produces a table lets you nod at plausible-looking numbers; one that
 * asserts a direction tells you when the model is lying to you.
 */

import { PRICE_MIN } from "../core/calibration.ts";
import { runScenario, type RunOptions } from "../core/run.ts";
import type { ScenarioConfig, SimulationState } from "../core/types.ts";
import { baselinePolicy, type PolicyActor } from "./baselinePolicy.ts";
import { stat, summariseRun, type RunSummary, type Stat } from "./compareRuns.ts";

/** One point on a sweep axis: a label, and how it perturbs the run. */
export interface SweepPoint {
  label: string;
  scenario?: (base: ScenarioConfig) => ScenarioConfig;
  transformInitialState?: (state: SimulationState) => void;
  policy?: PolicyActor;
}

export interface SweepAxis {
  /** The input being moved, in the Calibration §8 vocabulary. */
  name: string;
  points: SweepPoint[];
  /** What §8 says this input must do. Checked, not just printed. */
  expect: GradientExpectation[];
  notes?: string;
}

export type Direction = "up" | "down" | "flat" | "up-then-flat" | "up-then-down";

export interface GradientExpectation {
  metric: MetricKey;
  direction: Direction;
  /**
   * Ignore movements smaller than this, as a fraction of the first value.
   *
   * Metrics that live near a ceiling need a tighter one than the 5% default:
   * uptime going 95.2% → 98.6% is a 70% cut in downtime and unmistakably a
   * real effect, but it is only a 3.5% move in the number itself, so the
   * default reads it as flat. Set the tolerance in the units that matter to
   * the metric rather than pretending one number fits all of them.
   */
  tolerance?: number;
}

export type MetricKey =
  | "arrivals"
  | "sessionsCompleted"
  | "cumMargin"
  | "marginPerSession"
  | "cumAvgWaitSeconds"
  | "cumAbandonmentRatePct"
  | "cumUtilizationPct"
  | "cumUptimePct"
  | "sessionSuccessRatePct"
  | "trust"
  | "kwhDelivered"
  | "kwhPerSession"
  | "throughputPerHour"
  | "faults";

const METRIC: Record<MetricKey, (s: RunSummary) => number> = {
  arrivals: (s) => s.arrivals,
  sessionsCompleted: (s) => s.sessionsCompleted,
  cumMargin: (s) => s.cumMargin,
  marginPerSession: (s) => (s.sessionsCompleted > 0 ? s.cumMargin / s.sessionsCompleted : 0),
  cumAvgWaitSeconds: (s) => s.cumAvgWaitSeconds,
  cumAbandonmentRatePct: (s) => s.cumAbandonmentRatePct,
  cumUtilizationPct: (s) => s.cumUtilizationPct,
  cumUptimePct: (s) => s.cumUptimePct,
  sessionSuccessRatePct: (s) => s.sessionSuccessRatePct,
  trust: (s) => s.trust,
  kwhDelivered: (s) => s.kwhDelivered,
  kwhPerSession: (s) => (s.sessionsCompleted > 0 ? s.kwhDelivered / s.sessionsCompleted : 0),
  throughputPerHour: (s) => s.sessionsCompleted / 24,
  faults: (s) => s.faults,
};

export interface SweepCell {
  label: string;
  runs: RunSummary[];
  metrics: Record<MetricKey, Stat>;
}

export interface GradientVerdict {
  metric: MetricKey;
  expected: Direction;
  observed: Direction;
  values: number[];
  pass: boolean;
}

export interface SweepResult {
  axis: string;
  cells: SweepCell[];
  verdicts: GradientVerdict[];
  notes?: string;
}

export interface SweepOptions {
  scenario: ScenarioConfig;
  seeds: number;
  /** Defaults to the D22 baseline actor, so a sweep measures the mechanic, not play. */
  policy?: PolicyActor;
  seedPrefix?: string;
}

export function runSweep(axis: SweepAxis, options: SweepOptions): SweepResult {
  const { scenario, seeds, policy = baselinePolicy, seedPrefix = "s" } = options;

  const cells: SweepCell[] = axis.points.map((point) => {
    const runs: RunSummary[] = [];
    for (let i = 1; i <= seeds; i++) {
      const runOptions: RunOptions = {
        scenario: point.scenario ? point.scenario(scenario) : scenario,
        seed: `${seedPrefix}${i}`,
        policy: point.policy ?? policy,
        policyLabel: "baseline",
        logLevel: "info",
        collectLog: false,
        transformInitialState: point.transformInitialState,
      };
      runs.push(summariseRun(runScenario(runOptions)));
    }
    const metrics = {} as Record<MetricKey, Stat>;
    for (const key of Object.keys(METRIC) as MetricKey[]) {
      metrics[key] = stat(runs.map(METRIC[key]));
    }
    return { label: point.label, runs, metrics };
  });

  const verdicts = axis.expect.map((expectation) =>
    judge(expectation, cells.map((c) => c.metrics[expectation.metric].mean)),
  );

  return { axis: axis.name, cells, verdicts, notes: axis.notes };
}

/**
 * Direction over the whole grid, judged on the net movement from first to last
 * with a tolerance band. Monotonicity is deliberately not required — real
 * mechanics have plateaus and the grid is coarse — but a net movement the wrong
 * way is always a failure.
 */
function judge(expectation: GradientExpectation, values: number[]): GradientVerdict {
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const scale = Math.abs(first) > 1e-9 ? Math.abs(first) : 1;
  const tolerance = expectation.tolerance ?? 0.05;
  const change = (last - first) / scale;

  let observed: Direction;
  if (Math.abs(change) <= tolerance) observed = "flat";
  else observed = change > 0 ? "up" : "down";

  let pass: boolean;
  switch (expectation.direction) {
    case "up":
      pass = observed === "up";
      break;
    case "down":
      pass = observed === "down";
      break;
    case "flat":
      pass = observed === "flat";
      break;
    case "up-then-flat": {
      // Rises early, then stops rising — the shape of a constraint biting.
      const mid = values[Math.floor(values.length / 2)] ?? first;
      const rose = (mid - first) / scale > tolerance;
      const plateaued = Math.abs((last - mid) / scale) <= Math.abs((mid - first) / scale);
      pass = rose && plateaued;
      observed = rose ? (plateaued ? "up-then-flat" : "up") : observed;
      break;
    }
    case "up-then-down": {
      // Rises to an interior peak, then falls away — the shape of an optimum.
      //
      // Added for D42. Before it, the price axis stopped at £0.89 and margin
      // per session rose monotonically across the whole of it, so "up" was the
      // truthful expectation. Now that the axis runs past the price at which
      // drivers refuse, the honest claim is that there IS a peak and it is not
      // at either end — which is a stronger statement about the model than
      // monotonicity was, and the one the pricing decision rests on.
      let peak = 0;
      for (let i = 1; i < values.length; i++) {
        if ((values[i] ?? 0) > (values[peak] ?? 0)) peak = i;
      }
      const interior = peak > 0 && peak < values.length - 1;
      const rose = ((values[peak] ?? 0) - first) / scale > tolerance;
      const fell = ((values[peak] ?? 0) - last) / scale > tolerance;
      pass = interior && rose && fell;
      observed = pass ? "up-then-down" : observed;
      break;
    }
  }

  return { metric: expectation.metric, expected: expectation.direction, observed, values, pass };
}

// ---------------------------------------------------------------------------
// Axis builders — the §8 table, expressed as code
// ---------------------------------------------------------------------------

export function scaleWaves(base: ScenarioConfig, factor: number): ScenarioConfig {
  return {
    ...base,
    demandWaves: base.demandWaves.map((w) => ({
      ...w,
      arrivalRatePerMinute: w.arrivalRatePerMinute * factor,
    })),
  };
}

export function scaleReliability(state: SimulationState, faultFactor: number): void {
  for (const bay of Object.values(state.chargers)) {
    // faultFactor > 1 means MORE faults, so the unreliability is what scales.
    const unreliability = Math.min(0.9, (1 - bay.spec.reliabilityBase) * faultFactor);
    bay.spec = { ...bay.spec, reliabilityBase: 1 - unreliability };
  }
}

/** The eight gradients of Calibration §8, as runnable axes. */
export function sanityAxes(): SweepAxis[] {
  return [
    {
      name: "pricePerKwh",
      notes: "arrivals ↓, wait ↓, margin/session peaks then falls, trust ↘ mild",
      // Re-ranged for D42. The old four points (0.55–0.89) could not resolve an
      // optimum above £0.89, which is exactly where the corridor's is expected
      // once its drivers' ceilings reflect a 25-minute detour — so the axis
      // would have reported "the optimum is the top of the range" on every
      // site and called it a result. £0.05 steps across the full
      // PRICE_MIN–PRICE_MAX range: the design's criterion 1 asks for a ≥ £0.10
      // spread between sites, so the grid has to be finer than the bar it is
      // being used to measure.
      points: Array.from({ length: 16 }, (_, i) => PRICE_MIN + i * 0.05).map((price) => ({
        label: `£${price.toFixed(2)}`,
        scenario: (base) => ({ ...base, initialPricePerKwh: price }),
      })),
      expect: [
        { metric: "arrivals", direction: "down" },
        { metric: "cumAvgWaitSeconds", direction: "down" },
        // D42: "up" was only true because the old axis stopped below the
        // price at which drivers refuse. Across the full range there is a
        // peak, and where that peak sits now differs by site — which is the
        // whole point of the change.
        { metric: "marginPerSession", direction: "up-then-down" },
      ],
    },
    {
      name: "arrivalRate",
      notes: "queue ↑, abandonment ↑, utilization ↑ then plateau",
      // Rescaled 2026-08-17: the scenario's own waves now carry a ×1.8 demand
      // scale, so these multipliers compose with it. ×0.5–×1.3 here spans
      // ×0.9–×2.3 in absolute terms — the same span the old ×0.6–×2.2 covered
      // against the unscaled waves.
      points: [0.5, 0.75, 1.0, 1.3].map((factor) => ({
        label: `×${factor.toFixed(1)}`,
        scenario: (base) => scaleWaves(base, factor),
      })),
      expect: [
        { metric: "cumAvgWaitSeconds", direction: "up" },
        { metric: "cumAbandonmentRatePct", direction: "up" },
        { metric: "cumUtilizationPct", direction: "up-then-flat" },
      ],
    },
    {
      name: "faultProbability",
      notes: "uptime ↓, session success ↓, trust ↓",
      points: [0.5, 1, 3, 6].map((factor) => ({
        label: `×${factor}`,
        transformInitialState: (state) => scaleReliability(state, factor),
      })),
      expect: [
        { metric: "cumUptimePct", direction: "down", tolerance: 0.01 },
        { metric: "sessionSuccessRatePct", direction: "down", tolerance: 0.01 },
        { metric: "trust", direction: "down" },
      ],
    },
    {
      name: "patienceSeconds",
      notes: "abandonment ↓, avg wait ↑",
      points: [0.4, 1.0, 2.0, 4.0].map((factor) => ({
        label: `×${factor.toFixed(1)}`,
        // The scenario's own ×1.8 demand scale now supplies the queue this axis
        // needs, so the extra ×1.8 that used to be applied here is gone.
        scenario: (base) => ({ ...base, patienceMultiplier: factor }),
      })),
      expect: [
        { metric: "cumAbandonmentRatePct", direction: "down" },
        { metric: "cumAvgWaitSeconds", direction: "up" },
      ],
    },
    {
      name: "gridPowerKw",
      notes: "throughput ↑ until bay-limited, then flat",
      // Re-ranged 2026-08-17 for the 150/350 kW hardware. Measured: throughput
      // rises hard to ~650 kW, plateaus by ~800, and is flat to the last
      // decimal above it — 1,100 kW and 1,300 kW return byte-identical runs.
      // The old 100–500 range now sits entirely on the rising limb, which would
      // have hidden the plateau this axis exists to show.
      points: [350, 500, 650, 900].map((kw) => ({
        label: `${kw} kW`,
        scenario: (base) => ({ ...base, initialGridPowerKw: kw }),
      })),
      expect: [{ metric: "throughputPerHour", direction: "up-then-flat" }],
    },
    {
      name: "partialChargeTarget",
      notes: "kWh/session ↓, sessions/hr ↑ at peaks, wait ↓, trust ↘ mild",
      points: [undefined, 0.7, 0.6, 0.5].map((soc) => ({
        label: soc === undefined ? "off" : `${Math.round(soc * 100)}%`,
        scenario: (base) => ({ ...base, initialPartialChargeTargetSoc: soc }),
      })),
      expect: [
        { metric: "kwhPerSession", direction: "down" },
        { metric: "sessionsCompleted", direction: "up" },
        { metric: "cumAvgWaitSeconds", direction: "down" },
      ],
    },
    {
      name: "powerPolicy",
      notes: "equal_share → queue_relief: wait ↓, sessions ↑ at peaks, kWh ~unchanged",
      points: (["fast_first", "equal_share", "queue_relief"] as const).map((p) => ({
        label: p,
        // 350 kW against 1,300 kW of nameplate: hard contention, so the choice
        // of who waits actually shows up. (Was 150 kW, set against the old
        // 500 kW nameplate — the same degree of squeeze, re-expressed.)
        scenario: (base) => ({ ...base, initialGridPowerKw: 350, initialPowerPolicy: p }),
      })),
      expect: [
        { metric: "sessionsCompleted", direction: "up" },
        { metric: "cumAbandonmentRatePct", direction: "down" },
      ],
    },
    {
      name: "maintenanceLevel",
      notes:
        "reactive → preventive: uptime ↑ everywhere; margin's SIGN is archetype-dependent by design (OPEN-2 resolved)",
      points: (["reactive", "standard", "preventive"] as const).map((level) => ({
        label: level,
        scenario: (base) => ({ ...base, initialMaintenanceLevel: level }),
      })),
      expect: [
        { metric: "cumUptimePct", direction: "up", tolerance: 0.01 },
        // Margin deliberately has NO expectation here. Before OPEN-2 was
        // resolved, §8 asserted it must fall, and it rose on every archetype —
        // that was the dominance. Now it rises on a busy site (buying
        // reliability pays where things break) and falls on a quiet one (it
        // does not), which is the trade the mechanic is supposed to be. A
        // single-scenario gradient cannot express a sign that varies by
        // scenario; `strategies` is the test that can, and does.
        { metric: "cumUptimePct", direction: "up", tolerance: 0.01 },
      ],
    },
  ];
}
