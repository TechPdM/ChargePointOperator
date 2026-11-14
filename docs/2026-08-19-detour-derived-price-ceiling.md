# Detour-Derived Price Ceiling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared per-archetype price ceiling with a per-driver ceiling derived from the detour to the nearest alternative charger, so that the margin-optimal price differs between sites.

**Architecture:** Each vehicle draws `detourMinutes` from a per-scenario range at spawn and converts it to a price premium via the DfT value of travel time, amortised over the energy that driver actually wants. `maxAcceptablePricePerKwh` stops being a constant and becomes `base + premium`. The hard veto in `admission.ts` is untouched — only how the field gets its value changes.

**Tech Stack:** TypeScript (strict, `.ts` extensions in imports), Vitest, tsx for the headless CLI. No new dependencies.

**Spec:** `ChargePointOperator_PricingModel_Design.md`

## Global Constraints

- **Determinism is a hard invariant (D26).** One global mulberry32 stream drawn in pipeline order. `Math.random()`, `Date.now()`, `new Date()` are banned in `src/game/`. Every new draw must come from `ctx.rng`.
- **Adding an RNG draw shifts the whole downstream stream.** Every seed's run changes. This is expected, not a regression — see Task 4.
- **Calibration numbers live in `src/game/core/calibration.ts` only.** Architecture holds no tuning numbers. When a number proves wrong, change `ChargePointOperator_Calibration.md` first, then the code.
- **Value of time figures are 2014 perceived prices** from the DfT VTT study, Table 5.1: commute £11.21/hr, other non-work £5.12/hr. Not uprated — record in the assumptions register, do not silently adjust.
- **Detour ranges (sim-minutes):** Junction 42 `[8, 30]` · Kesteven `[5, 18]` · Eastgate `[2, 7]`.
- **Archetype bases:** `commuter` 0.78 · `enroute` 1.05 · `panic_low_soc` 1.44.
- **`DETOUR_PREMIUM_MAX` starts at 0.40** and is confirmed or moved in Task 7.
- **Do not fit any constant to an acceptance criterion.** If a criterion fails, that is a measurement result to report, not a number to adjust.

---

### Task 1: The premium function

A pure function, testable without a simulation. Everything else builds on it.

**Files:**
- Modify: `src/game/core/calibration.ts`
- Modify: `src/game/systems/arrivals.ts`
- Test: `tests/mechanics.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `detourPremiumPerKwh(detourMinutes: number, valueOfTimePerHour: number, requestedKwh: number): number`, exported from `src/game/systems/arrivals.ts`. `DETOUR_PREMIUM_MAX: number` exported from `src/game/core/calibration.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/mechanics.test.ts`. Put the import alongside the existing `priceMultiplier` import from the same module:

```ts
import { detourPremiumPerKwh, priceMultiplier } from "../src/game/systems/arrivals.ts";
```

and add `DETOUR_PREMIUM_MAX` to the existing named import from `../src/game/core/calibration.ts`. Then:

```ts
describe("detour premium (D42)", () => {
  it("is zero when the alternative is right there", () => {
    expect(detourPremiumPerKwh(0, 11.21, 21)).toBe(0);
  });

  it("is the detour's time cost spread over the energy bought", () => {
    // 30 min at £11.21/hr = £5.605, over 21 kWh = £0.267/kWh.
    expect(detourPremiumPerKwh(30, 11.21, 21)).toBeCloseTo(0.267, 3);
  });

  it("rises with detour", () => {
    const near = detourPremiumPerKwh(5, 5.12, 30);
    const far = detourPremiumPerKwh(20, 5.12, 30);
    expect(far).toBeGreaterThan(near);
  });

  it("falls as the driver buys more energy", () => {
    const topUp = detourPremiumPerKwh(20, 11.21, 10);
    const fill = detourPremiumPerKwh(20, 11.21, 40);
    expect(topUp).toBeGreaterThan(fill);
  });

  it("is clamped at the top — a 10 kWh top-up after a long detour", () => {
    // (60/60) × 11.21 / 10 = £1.121/kWh unclamped, which is more than the
    // whole price range. The clamp is what stops the tail running away.
    expect(detourPremiumPerKwh(60, 11.21, 10)).toBe(DETOUR_PREMIUM_MAX);
  });

  it("never divides by zero when a driver wants nothing", () => {
    expect(detourPremiumPerKwh(20, 11.21, 0)).toBe(DETOUR_PREMIUM_MAX);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/mechanics.test.ts -t "detour premium"
```

Expected: FAIL — `detourPremiumPerKwh is not a function` / `DETOUR_PREMIUM_MAX` not exported.

- [ ] **Step 3: Add the clamp constant**

In `src/game/core/calibration.ts`, in the `§4 Pricing & economics` section, immediately after `PRICE_MAX`:

```ts
/**
 * Ceiling on the detour premium (D42).
 *
 * The premium divides a fixed detour cost by the energy the driver actually
 * wants, which is the honest economics — a 10 kWh top-up really does justify a
 * bigger per-kWh premium than a 40 kWh fill. But the archetype ranges allow
 * top-ups as small as 10 kWh, and at the top of a corridor detour range that
 * produces premiums above £1/kWh — wider than the entire price range.
 *
 * FIRST GUESS, confirmed or moved by the measurement pass. Set it too low and
 * every driver on a long detour collapses onto the same ceiling and the cliff
 * comes back; too high and a handful of small top-ups will pay anything.
 */
export const DETOUR_PREMIUM_MAX = 0.4;
```

- [ ] **Step 4: Write the function**

In `src/game/systems/arrivals.ts`, below the existing `priceMultiplier` export:

```ts
/**
 * What a driver will pay above their base price, because the alternative costs
 * them a detour (D42).
 *
 * The trade is the driver's own: my alternative is `detourMinutes` away, that
 * time is worth `valueOfTimePerHour` to me, and I am spreading that cost over
 * the `requestedKwh` I came here to buy. Above this premium, driving on is
 * cheaper than paying.
 *
 * Value of time is per archetype and comes from the DfT VTT study (Table 5.1,
 * 2014 perceived prices) — see the calibration sheet §3.
 */
export function detourPremiumPerKwh(
  detourMinutes: number,
  valueOfTimePerHour: number,
  requestedKwh: number,
): number {
  if (detourMinutes <= 0) return 0;
  // A driver who wants no energy has nothing to spread the cost over; the
  // clamp is the only sane answer and it keeps the function total.
  if (requestedKwh <= 0) return DETOUR_PREMIUM_MAX;
  const raw = ((detourMinutes / 60) * valueOfTimePerHour) / requestedKwh;
  return Math.min(DETOUR_PREMIUM_MAX, raw);
}
```

Add `DETOUR_PREMIUM_MAX` to the existing import from `../core/calibration.ts` in that file.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/mechanics.test.ts -t "detour premium"
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/core/calibration.ts src/game/systems/arrivals.ts tests/mechanics.test.ts
git commit -m "Add the detour premium function (D42)"
```

---

### Task 2: Archetype and scenario constants

Re-derive the archetype numbers and give each scenario its detour range. No behaviour change yet — nothing reads the new fields until Task 3.

**Files:**
- Modify: `src/game/core/calibration.ts`
- Modify: `src/game/core/types.ts`
- Modify: `src/game/scenarios/roadsideHub.ts`, `commuterHub.ts`, `destinationSite.ts`
- Test: `tests/mechanics.test.ts`

**Interfaces:**
- Consumes: `detourPremiumPerKwh` from Task 1.
- Produces: `ArchetypeProfile.maxAcceptablePriceBase: number` and `ArchetypeProfile.valueOfTimePerHour: number` (replacing `maxAcceptablePricePerKwh`); `ScenarioConfig.detourMinutes: [number, number]`.

- [ ] **Step 1: Write the failing test**

Add to `tests/mechanics.test.ts`:

```ts
describe("archetype bases and detour ranges (D42)", () => {
  it("keeps the archetype tolerance ordering", () => {
    expect(ARCHETYPES.commuter.maxAcceptablePriceBase).toBeLessThan(
      ARCHETYPES.enroute.maxAcceptablePriceBase,
    );
    expect(ARCHETYPES.enroute.maxAcceptablePriceBase).toBeLessThan(
      ARCHETYPES.panic_low_soc.maxAcceptablePriceBase,
    );
  });

  it("puts every base above the price at which that archetype starts grumbling", () => {
    for (const p of Object.values(ARCHETYPES)) {
      expect(p.maxAcceptablePriceBase).toBeGreaterThan(p.referencePricePerKwh);
    }
  });

  it("uses the DfT commute value for commuters and non-work for the rest", () => {
    expect(ARCHETYPES.commuter.valueOfTimePerHour).toBeCloseTo(11.21, 2);
    expect(ARCHETYPES.enroute.valueOfTimePerHour).toBeCloseTo(5.12, 2);
    expect(ARCHETYPES.panic_low_soc.valueOfTimePerHour).toBeCloseTo(5.12, 2);
  });

  it("orders the sites by how captive their drivers are", () => {
    const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
    expect(mid(commuterHub.detourMinutes)).toBeLessThan(mid(destinationSite.detourMinutes));
    expect(mid(destinationSite.detourMinutes)).toBeLessThan(mid(roadsideHub.detourMinutes));
  });

  it("reproduces today's corridor ceilings at a Junction 42 mid detour", () => {
    // This is the anchor the bases were derived from (design §3.2): the
    // corridor keeps the tolerance it has, and the other sites come out
    // cheaper. If this drifts, the bases were retuned without saying so.
    const mid = (roadsideHub.detourMinutes[0] + roadsideHub.detourMinutes[1]) / 2;
    const c = ARCHETYPES.commuter;
    expect(c.maxAcceptablePriceBase + detourPremiumPerKwh(mid, c.valueOfTimePerHour, 21)).toBeCloseTo(0.95, 2);
  });
});
```

Add the scenario imports at the top of the file if not already present:

```ts
import { commuterHub } from "../src/game/scenarios/commuterHub.ts";
import { destinationSite } from "../src/game/scenarios/destinationSite.ts";
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/mechanics.test.ts -t "archetype bases"
```

Expected: FAIL — `maxAcceptablePriceBase` and `detourMinutes` do not exist.

- [ ] **Step 3: Change the ArchetypeProfile interface**

In `src/game/core/calibration.ts`, replace the `maxAcceptablePricePerKwh` field on `ArchetypeProfile`:

```ts
  /** Where this archetype starts grumbling about price (D21). */
  referencePricePerKwh: number;
  /**
   * What they would pay with a competing charger **right there** — no detour,
   * no captivity (D42). The situational part is added per driver at spawn.
   *
   * Derived, not chosen: each base is today's ceiling minus the premium a
   * Junction-42-typical detour (19 sim-min) buys for that archetype at its
   * mid-range energy demand. The corridor therefore keeps the tolerance it
   * already had, and the differentiation comes from the other two sites being
   * less captive — which is the honest direction, since the corridor's pricing
   * power was never the anomaly.
   */
  maxAcceptablePriceBase: number;
  /**
   * DfT, *Provision of market research for value of travel time savings and
   * reliability*, Aug 2015, Table 5.1 — **2014 perceived prices, £/hr**.
   * Commute £11.21, other non-work £5.12.
   *
   * Perceived prices, not market prices, is the right basis: this stands in for
   * what a driver believes their own time is worth while deciding to drive on.
   * Not uprated from 2014 — see the assumptions register.
   */
  valueOfTimePerHour: number;
```

- [ ] **Step 4: Set the three archetype profiles**

In the same file, in `ARCHETYPES`, replace the `maxAcceptablePricePerKwh` line
of each profile with these two lines. Keep every other field as it is.

In `commuter`:

```ts
    // Was 0.95. 0.95 − premium(19 min, £11.21/hr, 21.0 kWh mid demand) = 0.78.
    maxAcceptablePriceBase: 0.78,
    // DfT VTT Table 5.1, commute, 2014 perceived prices.
    valueOfTimePerHour: 11.21,
```

In `enroute`:

```ts
    // Was 1.10. 1.10 − premium(19 min, £5.12/hr, 35.8 kWh mid demand) = 1.05.
    maxAcceptablePriceBase: 1.05,
    // DfT VTT Table 5.1, other non-work, 2014 perceived prices.
    valueOfTimePerHour: 5.12,
```

In `panic_low_soc`:

```ts
    // Was 1.50. 1.50 − premium(19 min, £5.12/hr, 28.9 kWh mid demand) = 1.44.
    // Still by far the highest base: their alternative may not be reachable at
    // all, and that is what the base carries rather than the detour premium.
    maxAcceptablePriceBase: 1.44,
    valueOfTimePerHour: 5.12,
```

- [ ] **Step 5: Add the scenario field**

In `src/game/core/types.ts`, in `ScenarioConfig`, next to `referencePricePerKwh`:

```ts
  /**
   * Sim-minutes to the nearest alternative rapid charger, as a range (D42).
   *
   * The range's width is direction of approach: at a motorway junction the next
   * rapid is a long way ahead if you are heading on, and close behind if you
   * have just passed one. Each driver draws their own, which is what turns the
   * old shared price cliff into a demand curve.
   */
  detourMinutes: [number, number];
```

- [ ] **Step 6: Set the range on each scenario**

`src/game/scenarios/roadsideHub.ts`, after `referencePricePerKwh`:

```ts
  // Corridor hub: the next rapid is a junction away if you drive on, and one
  // junction back if you have just passed it. UK motorway rapid hubs sit at
  // roughly 20–25 mile spacing, which is 20–30 min at motorway speeds once you
  // count leaving and rejoining. This is the site with genuine pricing power.
  detourMinutes: [8, 30],
```

`src/game/scenarios/destinationSite.ts`:

```ts
  // Destination site: a market town has other chargers, but they are across
  // town rather than next door, and the driver is parked up anyway. Real
  // pricing power, but well short of the corridor's.
  detourMinutes: [5, 18],
```

`src/game/scenarios/commuterHub.ts`:

```ts
  // Commuter hub: chargers on the next street, a supermarket bank round the
  // corner, and home charging as the fallback that costs nothing to reach.
  // Almost no pricing power — this is the site where premium should hurt.
  detourMinutes: [2, 7],
```

- [ ] **Step 7: Fix every remaining reference to the renamed field**

```bash
grep -rn "maxAcceptablePricePerKwh" src tests
```

`src/game/systems/arrivals.ts` (the `demand` object) and `tests/power.test.ts:58` and `tests/mechanics.test.ts:47` will still refer to it. Leave `VehicleAgent.demand.maxAcceptablePricePerKwh` alone — that field keeps its name, because on a vehicle it really is the final per-kWh ceiling. Only the `ArchetypeProfile` reads change; in `arrivals.ts` `createVehicle` set it to `p.maxAcceptablePriceBase` for now (Task 3 replaces this line), and in the test helpers read `p.maxAcceptablePriceBase`.

- [ ] **Step 8: Run the tests and typecheck**

```bash
npx vitest run tests/mechanics.test.ts -t "archetype bases" && npm run typecheck
```

Expected: PASS, and no type errors.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "Re-derive archetype bases and give each site a detour range (D42)"
```

---

### Task 3: Draw the detour at spawn

Wires the model in. This is the step that changes behaviour.

**Files:**
- Modify: `src/game/core/types.ts`
- Modify: `src/game/systems/arrivals.ts:68-110` (`createVehicle`)
- Test: `tests/mechanics.test.ts`

**Interfaces:**
- Consumes: `detourPremiumPerKwh` (Task 1), `maxAcceptablePriceBase` / `valueOfTimePerHour` / `detourMinutes` (Task 2).
- Produces: `VehicleAgent.detourMinutes: number`, and `demand.maxAcceptablePricePerKwh` now varying per driver.

- [ ] **Step 1: Write the failing test**

`runScenario` takes an options object and returns a `RunResult` whose state is
`finalState` — match the existing calls in this file, do not invent a signature.

```ts
describe("per-driver ceilings (D42)", () => {
  function departed(scenario: ScenarioConfig, seed: string) {
    return runScenario({ scenario, seed, policy: baselinePolicy, collectLog: false })
      .finalState.departedVehicles;
  }

  it("gives drivers at one site different ceilings — the cliff is now a curve", () => {
    const seen = new Set(
      departed(roadsideHub, "s1").map((v) => v.maxAcceptablePricePerKwh.toFixed(3)),
    );
    expect(seen.size).toBeGreaterThan(20);
  });

  it("makes the corridor's drivers more tolerant than the commuter hub's", () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const corridor = mean(departed(roadsideHub, "s1").map((v) => v.maxAcceptablePricePerKwh));
    const urban = mean(departed(commuterHub, "s1").map((v) => v.maxAcceptablePricePerKwh));
    expect(corridor).toBeGreaterThan(urban);
  });

  it("never puts a ceiling below the archetype base", () => {
    for (const v of departed(roadsideHub, "s1")) {
      expect(v.maxAcceptablePricePerKwh).toBeGreaterThanOrEqual(
        ARCHETYPES[v.archetype].maxAcceptablePriceBase,
      );
    }
  });
});
```

This needs `maxAcceptablePricePerKwh` on the departed-vehicle record so the test
can read it — add it in Step 3. `ScenarioConfig` needs adding to the existing
type-only import from `../src/game/core/types.ts`.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/mechanics.test.ts -t "per-driver ceilings"
```

Expected: FAIL — the property does not exist on `DepartedVehicle`, and every ceiling is identical.

- [ ] **Step 3: Add the two record fields**

In `src/game/core/types.ts`, add to `VehicleAgent`:

```ts
  /** Sim-minutes to this driver's nearest alternative charger (D42). */
  detourMinutes: number;
```

and add to `DepartedVehicle` (so the day's traffic keeps what an analysis would need — the same reasoning as D39):

```ts
  detourMinutes: number;
  maxAcceptablePricePerKwh: number;
```

In `src/game/systems/vehicles.ts`, in the `departedVehicles.push({...})` literal, carry both across:

```ts
    detourMinutes: vehicle.detourMinutes,
    maxAcceptablePricePerKwh: vehicle.demand.maxAcceptablePricePerKwh,
```

- [ ] **Step 4: Draw the detour in `createVehicle`**

In `src/game/systems/arrivals.ts`, inside `createVehicle`, after the `currentSoc` draw and before the `urgencyScore` draw — **order matters, it is the RNG stream**:

```ts
  // D42: this driver's own alternative. Drawn per vehicle rather than fixed per
  // site, because direction of approach decides whether the next rapid is ahead
  // of you or behind you — which is what makes the refusal a curve.
  const [detourMin, detourMax] = state.scenario.detourMinutes;
  const detourMinutes = ctx.rng.range(detourMin, detourMax);
```

The `requestedKwh` expression is currently inline in the `demand` object. Lift it above the return so the premium can use it:

```ts
  // Driver-intent demand. The site's partial-charge policy may reduce this at
  // session start (D14); this figure is what they wanted.
  const requestedKwh = Math.max(0, (p.targetSoc - currentSoc) * batteryCapacityKwh);
  const maxAcceptablePricePerKwh =
    p.maxAcceptablePriceBase + detourPremiumPerKwh(detourMinutes, p.valueOfTimePerHour, requestedKwh);
```

Then in the returned object use `detourMinutes`, and in `demand` use `requestedKwh` and `maxAcceptablePricePerKwh` in place of the inline expressions.

- [ ] **Step 5: Put both in the arrival event**

In the `vehicle.arrived` emit in `spawnArrivals`, add to the `dataOf({...})` payload:

```ts
        detour_minutes: round(vehicle.detourMinutes, 1),
        max_acceptable_price_per_kwh: round(vehicle.demand.maxAcceptablePricePerKwh, 3),
```

This is the legibility half of the change: "nearest alternative 25 min, will pay up to £0.97" is a readable reason for a driver to have driven on. Without it the refusal is unexplainable from the log.

- [ ] **Step 6: Run the tests and typecheck**

```bash
npx vitest run tests/mechanics.test.ts -t "per-driver ceilings" && npm run typecheck
```

Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "Draw each driver's detour and derive their ceiling from it (D42)"
```

---

### Task 4: Re-baseline the existing suite

The new RNG draw shifts the stream, so every recorded figure moves. Separating this from Task 3 keeps "the model changed" apart from "the fixtures moved".

**Files:**
- Modify: `tests/mechanics.test.ts`, `tests/failureStates.test.ts`, `tests/power.test.ts`, `tests/determinism.test.ts`, `tests/logging.test.ts`, `tests/invariants.test.ts`, `tests/gameLoop.test.ts` — whichever actually fail.

- [ ] **Step 1: Run the whole suite and record what broke**

```bash
npm test 2>&1 | tail -60
```

- [ ] **Step 2: Triage each failure before touching it**

For every failing test, decide and write down which it is:

- **Stream shift** — a pinned number moved because the RNG advanced differently. Re-baseline: update the expected value, and note in a comment that D42 moved it.
- **Real behaviour change** — e.g. `tests/mechanics.test.ts:86` *"prices commuters out entirely at £1.10"* asserts `ARCHETYPES.commuter.maxAcceptablePricePerKwh < 1.10`. That claim is now site-dependent and the test needs rewriting against a *site*, not the archetype: assert that at £1.10 the commuter hub completes far fewer sessions than the corridor.
- **A genuine break** — the change is wrong. Stop and report rather than re-baselining.

Do not re-baseline anything you have not triaged. A silently updated expected value is how a real regression gets buried.

- [ ] **Step 3: Verify determinism still holds**

```bash
npx vitest run tests/determinism.test.ts
```

Expected: PASS. This must pass without re-baselining anything beyond recorded hashes — if two runs on one seed disagree, the new draw was placed outside the single stream and Task 3 Step 4 was done wrong.

- [ ] **Step 4: Full suite green**

```bash
npm test && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "Re-baseline the suite after the D42 stream shift"
```

---

### Task 5: Extend the price sweep so it can answer the question

The shipped axis is four points across £0.55–£0.89 and cannot resolve an optimum above £0.89 — where the corridor's is expected.

**Files:**
- Modify: `src/game/experiment/sweep.ts:216-229`

- [ ] **Step 1: Widen the axis**

Replace the `points` line of the `pricePerKwh` axis:

```ts
      // Re-ranged for D42. The old four points (0.55–0.89) could not resolve an
      // optimum above 0.89, which is exactly where the corridor's is expected
      // once its drivers' ceilings reflect a 25-minute detour. £0.05 steps
      // across the full PRICE_MIN–PRICE_MAX range: the design's criterion 1
      // asks for a ≥ £0.10 spread between sites, so the grid has to be finer
      // than the bar it is measuring.
      points: Array.from({ length: 16 }, (_, i) => 0.45 + i * 0.05).map((price) => ({
        label: `£${price.toFixed(2)}`,
        scenario: (base) => ({ ...base, initialPricePerKwh: price }),
      })),
```

- [ ] **Step 2: Check it runs on all three scenarios**

```bash
npx tsx src/game/headless.ts sweep --axis pricePerKwh --scenario roadside --seeds 12
npx tsx src/game/headless.ts sweep --axis pricePerKwh --scenario commuter --seeds 12
npx tsx src/game/headless.ts sweep --axis pricePerKwh --scenario destination --seeds 12
```

Expected: 16 rows each, and the monotonic expectations in the axis still hold.

- [ ] **Step 3: Commit**

```bash
git add src/game/experiment/sweep.ts
git commit -m "Widen the price sweep to the full range at £0.05 steps"
```

---

### Task 6: Measure — does the optimum actually differ by site?

Not a TDD task. The deliverable is a measurement and a verdict, written down. **Criteria 1 and 2 are decided here, and if they fail, the finding is reported — no constant is adjusted to rescue them.**

**Files:**
- Modify: `ChargePointOperator_PricingModel_Design.md` (record results in a new §10)

- [ ] **Step 1: Run the three-site price sweep at 20 seeds**

```bash
for s in roadside commuter destination; do npx tsx src/game/headless.ts sweep --axis pricePerKwh --scenario $s --seeds 20 --json; done
```

- [ ] **Step 2: Record the margin-optimal price per site**

Build the table that replaces discovery §2.1. For each site: the price at which margin peaks, and the margin there.

- [ ] **Step 3: Check criterion 1**

Highest site optimum minus lowest must be **≥ £0.10**. Record the actual spread. It was £0.00.

- [ ] **Step 4: Check criterion 2**

For each site, compare margin at list price against margin at 1.15 × list, 20 seeds, paired. At least one site must be **worse** at +15%. Eastgate is the expected candidate.

- [ ] **Step 5: Write the results into the design doc**

Add a `## 10. Measured` section: the table, both verdicts, and — if either failed — what the measurement says about *why*, with the next action. Narrow detour spread and mis-set bases are distinguishable: if all three optima moved together, the bases are wrong; if they did not move apart, the ranges are too close.

- [ ] **Step 6: Commit**

```bash
git add ChargePointOperator_PricingModel_Design.md
git commit -m "Measure the per-site price optima under D42"
```

---

### Task 7: Confirm the clamp, then recalibrate

`DETOUR_PREMIUM_MAX` was a first guess; the goals were all fitted to the old demand model (D36) and must be re-fitted.

**Files:**
- Modify: `src/game/core/calibration.ts` (clamp, if measurement moves it)
- Modify: all three `src/game/scenarios/*.ts` (`goals`)
- Modify: `ChargePointOperator_Calibration.md` (§3, §4, §7, assumptions register)

- [ ] **Step 1: Check whether the clamp binds**

Run a corridor day and count how many drivers land exactly on `DETOUR_PREMIUM_MAX`:

```bash
npx tsx src/game/headless.ts run --scenario roadside --seed s1 --ndjson | grep vehicle.arrived
```

If a large share are clamped, the clamp is doing the archetype's job and the cliff is back — raise it. If none are, it is inert and can rise or go. Record which, and the share.

- [ ] **Step 2: Re-measure the baseline spread on all three scenarios**

```bash
for s in roadside commuter destination; do npx tsx src/game/headless.ts batch --seeds 20 --policy baseline --scenario $s --json; done
```

- [ ] **Step 3: Re-fit all four goals**

Set each threshold from the measured 20-seed spread, picking round numbers rather than fitting to the decimal — the method D36 used. Keep the comment style of the existing `goals` blocks: state the measured spread the numbers came from.

- [ ] **Step 4: Re-measure the D13 difficulty floor**

```bash
for s in roadside commuter destination; do npx tsx src/game/headless.ts gate --scenario $s --seeds 20; done
```

Must be **≥ 80%** on all three. It sat at exactly 80% with no headroom before this work (D36's own warning), so treat a drop as expected and re-fit goals rather than reverting the model.

- [ ] **Step 5: Re-measure Calibration §7**

Replace the measured output-range table. Carry the previous measurement in the comparison column, as v3.3 did.

- [ ] **Step 6: Add the value-of-time assumption to the register**

Calibration §9: the VTT figures are 2014 perceived prices, not uprated, which understates premiums.

- [ ] **Step 7: Commit**

```bash
git add src ChargePointOperator_Calibration.md
git commit -m "Recalibrate goals and output ranges for the D42 demand model"
```

---

### Task 8: Criterion 2 with the session goal still scored

The checkpoint that makes a later failure legible. **Do not skip it to save a run.**

**Files:**
- Modify: `ChargePointOperator_PricingModel_Design.md` (§10)

- [ ] **Step 1: Run the strategy separation test**

```bash
for s in roadside commuter destination; do npx tsx src/game/headless.ts strategies --scenario $s --seeds 20 --json; done
```

- [ ] **Step 2: Apply D38's separation test**

Best strategy by margin per site, and which strategies cannot be ruled out against it. Criterion 2 fails if any one strategy is a credible contender on all three sites — the `premium+preventive` trap.

- [ ] **Step 3: Record the verdict**

Write it into §10. **If criterion 2 fails here, stop and report.** The cause is the price model, not the goal change, and Task 9 would only obscure that.

- [ ] **Step 4: Commit**

```bash
git add ChargePointOperator_PricingModel_Design.md
git commit -m "Record criterion 2 under D42 with the session goal still scored"
```

---

### Task 9: Remove the session goal

**Files:**
- Modify: `src/game/core/types.ts` (`ScenarioGoals`)
- Modify: all three `src/game/scenarios/*.ts`
- Modify: `src/game/systems/scoring.ts` and any selector or panel that reads it
- Modify: `src/ui/components/` — whichever surface shows the goal
- Test: whichever tests assert on four goals

- [ ] **Step 1: Find every reader**

```bash
grep -rn "minSessionsCompleted\|sessionsCompleted" src tests
```

Distinguish the **goal** from the **KPI**. `sessionsCompleted` stays as a measured KPI and stays on the scorecard as information; only `minSessionsCompleted` — the scored threshold — comes out.

- [ ] **Step 2: Remove the field and its scoring**

Delete `minSessionsCompleted` from `ScenarioGoals` and from all three scenarios, and remove the goal-met branch from `scoring.ts`. The typechecker will find the rest.

- [ ] **Step 3: Run the suite**

```bash
npm test && npm run typecheck
```

Re-baseline any test that counted four goals.

- [ ] **Step 4: Re-run the gate on all three scenarios**

```bash
for s in roadside commuter destination; do npx tsx src/game/headless.ts gate --scenario $s --seeds 20; done
for s in roadside commuter destination; do npx tsx src/game/headless.ts strategies --scenario $s --seeds 20 --json; done
```

Criteria 2, 3 and 4 and the D13 floor (≥ 80%) must all still hold with three goals. The floor may need the three remaining thresholds re-fitting — that is expected, and it is re-fitting, not weakening: record the measured spread each new threshold came from.

- [ ] **Step 5: Record the outcome**

In §10: whether the session goal was load-bearing after all. This answers the question the discovery doc opened with.

- [ ] **Step 6: Commit**

```bash
git add src tests ChargePointOperator_PricingModel_Design.md
git commit -m "Drop minSessionsCompleted from scoring (D42)"
```

---

### Task 10: Write it down

**Files:**
- Modify: `ChargePointOperator_Decision_Log.md`
- Modify: `ChargePointOperator_Gate_Scorecard.md`
- Modify: `ChargePointOperator_Scenario_RoadsideHub.md`
- Modify: `README.md` if it describes the goals

- [ ] **Step 1: Write the D42 entry**

Append to the `## Accepted` section, matching the house style — one bold sentence, the date and ratifier, then what changed and what it replaces:

```markdown
**D42 — What a driver will pay depends on what else they could do.** *(2026-08-19, ratified by Mark)* `maxAcceptablePricePerKwh` is no longer an archetype constant. Each driver draws a detour to their nearest alternative from a per-scenario range and pays a premium over their archetype base equal to that detour's time cost, valued at the DfT VTT and spread over the energy they came to buy. The shared price cliff becomes a per-site demand curve, and `minSessionsCompleted` comes out of scoring with it — the session goal existed to stop premium pricing dominating, and site-differentiated ceilings now do that job on their own.
```

- [ ] **Step 2: Update the gate scorecard**

Criteria 1–4 with the new evidence and the new goal count.

- [ ] **Step 3: Update the scenario prose**

`ChargePointOperator_Scenario_RoadsideHub.md` — the site's detour range and what it means for pricing. This is the player-facing description of why premium works at Junction 42.

- [ ] **Step 4: Mark the discovery doc closed**

Add a line at the top of `ChargePointOperator_PricingModel_Discovery.md` pointing at the design doc and D42, so the open questions in its §8 are not read as still open.

- [ ] **Step 5: Commit**

```bash
git add *.md
git commit -m "Record D42 and update the gate scorecard"
```
