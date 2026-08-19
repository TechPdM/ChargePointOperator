# ChargePointOperator — Pricing Model: Design

**Status:** design agreed, **not yet implemented.** No code has been changed.
**Date:** 2026-08-19
**Supersedes the options in:** `ChargePointOperator_PricingModel_Discovery.md` §4 and §8.
**Wants:** a D-entry (next free number: **D42**).

---

## 1. What this changes, in one paragraph

The driver price ceiling stops being a constant per archetype and becomes a
value derived per driver from **how far they would have to detour to the nearest
alternative charger**. Sites declare a detour range instead of inheriting a
shared wall. That is the whole change; `siteScore`, admission logic and the
elasticity model are untouched.

The point is **variance in the optimum price between sites**. Today margin peaks
at £0.85 on a motorway services, an urban commuter car park and a garden centre
alike, because all three hit the same `commuter` ceiling of £0.95. Pricing is a
lookup, not a decision.

`minSessionsCompleted` comes out of scoring as part of this work (§7).

---

## 2. The model

Each vehicle draws a detour at spawn and converts it into a price premium:

```
detourMinutes  ~  U(site.detourMinutes[0], site.detourMinutes[1])

premium        =  (detourMinutes / 60 × VALUE_OF_TIME_PER_HOUR) / requestedKwh
                  clamped to [0, DETOUR_PREMIUM_MAX]

ceiling        =  archetype.maxAcceptablePriceBase + premium
```

The reasoning is a driver's own: my alternative costs me a detour; I will pay a
premium here up to the point where driving to it is cheaper. Above that I drive
on. It is the same trade the hard veto already models, with the number derived
rather than chosen.

**Two properties follow, and they are the two things §4 of the discovery doc
wanted from separate factors A1 and A2:**

- **The cliff becomes a curve.** Drivers at one site refuse at different prices
  because their alternatives genuinely differ, not because noise was added to a
  constant. Finding the optimum stops being finding one edge.
- **Sites differentiate.** Not because a multiplier says so, but because the
  distributions differ.

One parameter set does both, so the A2/A3 double-counting risk the discovery
doc flagged does not arise.

---

## 3. Constants to derive

Nothing below is decided. These are the numbers the work has to produce, and
where each has to be justified from.

### 3.1 `VALUE_OF_TIME_PER_HOUR` — one new constant

Checked against the **DfT WebTAG databook** values of time for non-work car
travel. This must be read from the databook, not asserted from memory: §7 of the
discovery doc exists because an earlier claim about minimum-service obligations
was asserted without a source, and this constant is load-bearing in exactly the
way that one was not.

### 3.2 `maxAcceptablePricePerKwh` → `maxAcceptablePriceBase`

The meaning changes, so the numbers must change with it. The base is **what this
driver would pay with a competing charger right there** — no detour, no captivity.
Today's 0.95 / 1.10 / 1.50 are ceilings that already include an unstated amount
of pricing power, so all three come down and the premium adds it back explicitly.

The archetype ordering stays: a panic arrival at 5% SOC pays more than a
commuter regardless of what is nearby, because their alternative may not be
reachable at all. That is what the base carries.

### 3.3 `detourMinutes` per scenario

Justified in comments against real UK rapid-charger spacing, in the manner
`initialGridPowerKw` is justified against real grid connections. Starting
proposal, to be argued rather than accepted:

| Site | Range | Reasoning |
| :-- | :-- | :-- |
| Junction 42 (corridor) | `[8, 30]` | Next rapid is a junction away ahead; one behind you if you just passed it. |
| Kesteven (destination) | `[5, 18]` | A town has options, but you are not on top of them. |
| Eastgate (commuter) | `[2, 7]` | Chargers on the next street, and home charging as a fallback. |

### 3.4 `DETOUR_PREMIUM_MAX` — a clamp, and the reason it is needed

Dividing by the driver's own `requestedKwh` is the honest economics: if you only
need 10 kWh, a £6 detour cost is £0.60/kWh, and you really would pay it. But the
smallest realistic top-up in the current archetype ranges is ~10 kWh, so the
corridor's 30-minute tail produces premiums in the £0.50+ range. That is a very
tolerant driver and probably wider than wanted.

**Recommendation:** keep the per-driver divisor, clamp the premium, and set the
clamp by measurement rather than taste.

**Named risk, to be checked during measurement:** this couples price tolerance to
session size, which the partial-charge policy lever also moves. A player
shortening sessions raises the average premium their drivers will bear. That may
be a pleasing emergent effect or an unwanted interaction; it is not currently
either, because it does not exist. Measure it before judging it.

---

## 4. Code changes

Six source files and the calibration sheet. No new systems.

| File | Change |
| :-- | :-- |
| `src/game/core/types.ts` | Add `detourMinutes: [number, number]` to `ScenarioConfig`. Add `detourMinutes` to `VehicleAgent` (it should be visible in the event log for legibility). |
| `src/game/core/calibration.ts` | Rename `maxAcceptablePricePerKwh` → `maxAcceptablePriceBase` on `ArchetypeProfile`, re-derive all three. Add `VALUE_OF_TIME_PER_HOUR` and `DETOUR_PREMIUM_MAX` to §4. |
| `src/game/systems/arrivals.ts` | In `createVehicle`, draw `detourMinutes` and compute `demand.maxAcceptablePricePerKwh` from it. `requestedKwh` is already in scope at that point. Add both to the `vehicle.arrived` debug payload. |
| `src/game/scenarios/*.ts` | One `detourMinutes` field each, with the justification comment. |
| `ChargePointOperator_Calibration.md` | §3 archetype table, §4 new constants, §7 re-measured. |

`admission.ts` is deliberately not in this list. The hard veto still reads
`vehicle.demand.maxAcceptablePricePerKwh`; only how that field got its value
changes.

### 4.1 Tests

- **New:** a unit test that the premium is monotonic in detour minutes, zero at
  zero detour, and respects the clamp at the top.
- **New:** a determinism test that two runs on one seed draw identical detours —
  the draw is a new RNG consumer and will shift every downstream stream, so
  every recorded fixture moves. Expect that, do not treat it as a regression.
- **Existing:** `mechanics.test.ts` and `contrast.test.ts` both assert on price
  behaviour and will need re-baselining.

---

## 5. Measurement

The shipped `pricePerKwh` sanity axis is four points across £0.55–£0.89. It
**cannot resolve this work's primary acceptance criterion** — the corridor
optimum is expected to move above £0.89, off the top of the axis. The sweep
needs extending in range and granularity before it can answer the question.

Order of work:

1. Extend the price axis to **£0.45–£1.20 in £0.05 steps** (16 points, the full
   `PRICE_MIN`–`PRICE_MAX` range). The grid is stated here so criterion 1 below
   is a fixed bar rather than one that moves with whatever granularity was run.
2. Re-measure the three-site price sweep (the discovery doc's §2.1 table).
3. Re-fit all four goals on all three scenarios from the new baseline spread.
4. Re-measure the D13 difficulty floor. **It sits at exactly 80% with no
   headroom** by D36's own warning; treat a drop as expected until proven
   otherwise, and re-fit goals rather than reverting the model.
5. Re-run the D38 separation test (`strategies`) **with `minSessionsCompleted`
   still scored**.
6. Re-measure Calibration §7.
7. Re-run criteria 3 and 4.

---

## 6. Acceptance criteria

Carried from the discovery doc §5, amended where the session-goal decision
changes them. Stated before any tuning, so the work stays falsifiable.

1. **Margin peaks at materially different prices per site.** On the £0.05 grid
   of §5, the highest and lowest site optimum must differ by **at least £0.10**
   — two grid steps, so the result cannot be one step of grid noise. Currently
   the spread is £0.00: all three peak at £0.85.
2. **Premium pricing is actively wrong somewhere** — at least one site where
   margin at **1.15 × list price is below margin at list price**, over 20 seeds
   with the D38 paired test. Eastgate is the expected candidate.
3. **Criterion 2 passes under D38's separation test, with sessions removed.**
   This is stricter than the discovery doc's version and is the real bar (§7).
4. **D13 floor holds at ≥80%** on all three scenarios, after re-fitting.
5. **Criterion 4 (decisions matter) still passes.**

---

## 7. The session goal, and the risk it carries

`minSessionsCompleted` comes out. It is not a measure a real operator manages to,
and it is not appropriate to what this model represents.

**This is load-bearing and the plan must not soften it.** Per discovery §2.5, the
session goal is currently *the only thing* ruling out `premium+preventive` on the
corridor. Removing it means the detour model has to carry criterion 2 on its own,
with no fallback.

Sequencing chosen to make that failure legible rather than confusing:

1. Land the model, re-fit, and confirm criterion 2 passes **with sessions still
   scored**. If it fails here, the price model is the cause.
2. Then remove `minSessionsCompleted` and re-verify.

If criterion 2 fails at step 2 but passed at step 1, the finding is that the
detour spread is too narrow to separate strategies alone — a measurement result
with a clear next action (widen the ranges, or revisit the archetype bases), not
a mystery.

Deliberately **not** in scope: replacing sessions with an uptime goal. The
discovery doc noted uptime has regulatory grounding that driver count lacks;
that is not sufficient reason to add a goal, and it is a separate decision.

---

## 8. Considered and dropped

- **Named approach directions** (northbound / southbound / local, each with a
  detour and a mix weight, optionally coupled to time of day). More legible and
  it would have given the A4 time-of-day factor for free, but it is more
  machinery for the same first-order effect. The continuous range gets the
  variance; direction of approach survives as the documented reason the range
  has width.
- **Approach B** (delete the ceiling, make `siteScore` site-aware). Still the
  cleaner end state on paper — one mechanism rather than two. Not taken because
  it is a larger behavioural change than the problem requires, and the hard veto
  is what currently produces near-total refusal at £1.20. If the detour ranges
  end up needing to stack with further factors to differentiate, that is the
  signal to revisit B.
- **A3 (state of charge) and A4 (time of day).** Partly redundant under this
  model — a low-SOC driver's tolerance is already carried by their archetype
  base, and the wave table already varies mix by hour.

---

## 9. Cost, unchanged from discovery §6

This moves every calibrated number in the project. All four goals on three
scenarios were fitted to the current demand model (D36) and need re-fitting;
Calibration §7 needs re-measuring for the third time in three days; criteria 2,
3 and 4 are all scored off this model. Expect a full recalibration pass, not a
tuning tweak.
