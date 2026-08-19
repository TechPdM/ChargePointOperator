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

## 3. Constants

**Settled 2026-08-19 (Mark).** Each subsection below records the decision taken
and the reasoning, in place of the options that were open at first writing.

### 3.1 Value of time — **sourced, and per-archetype**

**Source:** DfT, *Provision of market research for value of travel time savings
and reliability — Non-Technical Summary*, August 2015 (the Arup / ITS Leeds /
Accent national VTT study that underpins TAG). Table 5.1, "VTTs for routine
appraisals with illustrative distance bands", **2014 perceived prices, £/hr**:

| Journey purpose | New VTT | Superseded WebTAG value |
| :-- | --: | --: |
| Commute, all modes | **£11.21** | £7.62 |
| Other non-work, all modes | **£5.12** | £6.77 |

**Perceived** prices, not market or factor prices, is the correct basis: this
number stands in for what a driver believes their time is worth while deciding
whether to drive on, which is precisely what a perceived-price VTT measures.

**Decision — a per-archetype field, not one global constant.** TAG publishes two
figures and the archetypes map cleanly onto both, so choosing one globally would
put an arbitrary judgement on top of a sourced number. `valueOfTimePerHour` goes
on `ArchetypeProfile` alongside `priceSensitivity` and `waitSensitivity`, which
is the same shape as everything else there — one field rather than one constant,
no extra machinery.

| Archetype | TAG purpose | £/hr |
| :-- | :-- | --: |
| `commuter` | Commute | 11.21 |
| `enroute` | Other non-work | 5.12 |
| `panic_low_soc` | Other non-work | 5.12 |

**Consequence, stated because it is counterintuitive.** Commuters get the
*larger* detour premium: a higher value of time, spread over a smaller top-up.
En-route drivers get the smaller one — lower VTT, and 35+ kWh to spread it over.
Site differentiation therefore comes from detour minutes, not from who turns up.
This is the real economics of a fixed detour cost amortised over a purchase, and
it is left in rather than corrected for.

**Not uprated from 2014 prices.** No uprating factor is applied, because none has
been sourced. This understates premiums and so is the conservative direction;
recorded in the assumptions register rather than silently accepted.

### 3.2 `maxAcceptablePricePerKwh` → `maxAcceptablePriceBase`

The meaning changes, so the numbers must change with it. The base is **what this
driver would pay with a competing charger right there** — no detour, no captivity.
Today's 0.95 / 1.10 / 1.50 are ceilings that already include an unstated amount
of pricing power, so all three come down and the premium adds it back explicitly.

The archetype ordering stays: a panic arrival at 5% SOC pays more than a
commuter regardless of what is nearby, because their alternative may not be
reachable at all. That is what the base carries.

**Decision — anchored on the archetype's own reference price, with a gap that is
derived rather than flat.** The base sits a stated gap above
`referencePricePerKwh` (0.75 / 0.85 / 1.00): refusal begins a little above where
grumbling begins.

**A flat gap does not work, and the arithmetic is worth showing.** A uniform
+£0.05 would give bases of 0.80 / 0.90 / 1.05 — which collapses the archetype
spread that makes a panic arrival tolerant. Today the gaps over reference are
+0.20 / +0.25 / +0.50; a flat gap throws that character away and would make
`PRICE_MAX` (£1.20) a price at which literally nobody charges.

So the gap per archetype is derived by requiring that each archetype keeps its
**current** total tolerance at a Junction-42-typical detour, and that everywhere
less captive comes out cheaper:

```
base  =  today's ceiling  −  premium(19 min, archetype VTT, archetype mid kWh)
```

| Archetype | Today | Mid kWh | Premium @19 min | **Base** | Gap over reference |
| :-- | --: | --: | --: | --: | --: |
| `commuter` | 0.95 | 21.0 | 0.169 | **0.78** | +0.03 |
| `enroute` | 1.10 | 35.8 | 0.045 | **1.05** | +0.20 |
| `panic_low_soc` | 1.50 | 28.9 | 0.056 | **1.44** | +0.44 |

The corridor therefore lands close to where it is today by construction, and the
differentiation comes from the other two sites being *less* captive — which is
the honest direction, since Junction 42 is the site whose current pricing power
was never the anomaly.

These are starting values. §5 confirms or moves them by measurement.

Fitting the bases to the acceptance criteria was rejected outright: it is the
failure mode §3.3 of the discovery doc and OPEN-7 set a discipline against, and
it would make §6 unfalsifiable.

### 3.3 `detourMinutes` per scenario

**Decision — taken as proposed.** Justified in comments against real UK
rapid-charger spacing, in the manner `initialGridPowerKw` is justified against
real grid connections. Widening the corridor range pre-emptively was rejected as
tuning toward a criterion rather than toward the geography; if the spread proves
too narrow, that is a measurement result (§7) with a clear next action.

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

**Decision — keep the driver's actual `requestedKwh` as the divisor**, clamp the
premium, and set the clamp by measurement rather than taste. The alternative —
dividing by a nominal ~25 kWh — would kill both the long-tail problem and the
partial-charge coupling by construction, which is throwing away a real effect to
avoid measuring it.

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
| `src/game/core/calibration.ts` | On `ArchetypeProfile`: rename `maxAcceptablePricePerKwh` → `maxAcceptablePriceBase` and re-derive all three; add `valueOfTimePerHour`. Add `DETOUR_PREMIUM_MAX` to §4. |
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
- **Existing:** `mechanics.test.ts` pins `ARCHETYPES.commuter`'s ceiling below
  £1.10 — a claim that becomes site-dependent and needs rewriting against a
  site rather than an archetype. `failureStates.test.ts` and `power.test.ts`
  both assert on price behaviour. Every recorded figure moves regardless, since
  a new RNG draw shifts the stream.

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
- **Approach B — half of it was taken after all**, once §10.1 showed A alone
  could not move the corridor's optimum. `siteScore` now reads the **site's**
  reference price instead of the archetype's (D43). See §11.

  The other half of B as the discovery doc described it — *deleting*
  `maxAcceptablePricePerKwh` — was **not** taken, and deliberately. By the time
  the choice arrived the hard ceiling had been measured doing real work: it is
  what makes premium pricing lose money at Eastgate. Deleting it to satisfy a
  description written before that measurement existed would have been throwing
  away a result.
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

---

## 10. Measured

**Date:** 2026-08-19. Baseline policy, 20 seeds, £0.05 grid across £0.45–£1.20.

### 10.1 Margin-optimal price per site — criterion 1, **marginal pass**

| Site | List | **Optimum** | Margin there | Was |
| :-- | --: | --: | --: | --: |
| Junction 42 (corridor) | £0.79 | **£0.85** | £3,994 | £0.85 |
| Kesteven (destination) | £0.55 | **£0.85** | £845 | £0.85 |
| Eastgate (commuter) | £0.72 | **£0.75** | £1,050 | £0.85 |

Spread **£0.10** against a £0.10 bar. It passes on the letter and should not be
reported as more than that: **two of the three sites still share an optimum**,
and only Eastgate separated. The spread was £0.00; it is now one grid step wide.

**Why the corridor did not move, which the design got wrong.** §3.2 predicted
Junction 42's optimum would rise as its drivers' ceilings rose to a median
£0.94. It did not move at all. The ceiling is not what sets the corridor's
optimum — wave elasticity is. Arrivals fall 32% by £1.15 through
`priceMultiplier` regardless of what any driver would tolerate, and trust and
wait move with them. Raising the ceiling only changes the answer where the
ceiling binds, and on the corridor it does not bind until well past the
profitable range.

That is a real limitation of Approach A and it is the argument the discovery
doc's §4 Approach B made in advance: two mechanisms price this model, and this
change only touched the harder one. Recorded rather than tuned around.

### 10.2 Premium pricing — criterion 2, **pass**

+15% on list against list, 20 seeds, paired:

| Site | List → +15% | Δ margin | *t* | Worse on | Verdict |
| :-- | :-- | --: | --: | --: | :-- |
| Kesteven | £0.55 → £0.63 | **+£252** | 5.96 | 1/20 | premium is *right* here |
| Junction 42 | £0.79 → £0.91 | −£119 | −0.80 | 11/20 | neutral — not separable |
| Eastgate | £0.72 → £0.83 | **−£339** | −4.49 | 17/20 | **premium loses money** |

Criterion 2 asked for at least one site where +15% loses money. Eastgate does,
decisively.

**The result worth more than criterion 1.** The question a player actually faces
is not "what is the optimum" but "should I put the price up here", and that now
has **three different answers on three sites** — yes at Kesteven, no at
Eastgate, and it-does-not-matter at Junction 42. Before this change the answer
was "yes" everywhere, on day one, by a wide margin. Criterion 1 measures the
weaker of the two things this work was for.

---

## 11. Approach B, and why A alone was not enough

§10.1 recorded the failure plainly: A moved Eastgate and left Junction 42 and
Kesteven sharing an optimum. The cause was that A only touched the **hard**
ceiling, and at the corridor the hard ceiling does not bind anywhere near the
profitable range. The **soft** test — `siteScore` — is what sets the optimum,
and it was reading `ARCHETYPES[archetype].referencePricePerKwh`.

That is the site-blindness in one line. A commuter judged £0.85 identically at a
motorway services and a garden centre, because the reference they measured it
against travelled with them instead of belonging to the place.

**The principle:** a reference price is what charging costs round here — a
property of the market. How much a driver minds paying over it is
`priceSensitivity` — a property of the driver. The code had the first backwards.

Archetype character is unharmed, because it never lived in the reference:
`panic_low_soc` carries `priceSensitivity` 0.1 against a commuter's 0.7, so a
desperate driver still barely registers price wherever they are.

### 11.1 Measured — criteria 1 and 2, **both pass**

Same method as §10: baseline policy, 20 seeds, £0.05 grid.

| Site | Reference | Optimum before any change | After A | **After A + B** |
| :-- | --: | --: | --: | --: |
| Junction 42 | £0.79 | £0.85 | £0.85 | **£0.90** |
| Eastgate | £0.72 | £0.85 | £0.75 | **£0.75** |
| Kesteven | £0.62 | £0.85 | £0.85 | **£0.70** |

**Criterion 1: pass.** Spread **£0.20** against a £0.10 bar — four grid steps,
and three distinct optima rather than the two A managed. A motorway services, an
urban car park and a garden centre now want to charge three different prices.

**Criterion 2: pass, and stronger than under A.** +15% on list, 20 seeds, paired:

| Site | Δ margin | *t* | Worse on | Under A alone |
| :-- | --: | --: | --: | :-- |
| Junction 42 | **+£197** | 2.17 | 6/20 | −£119, not separable |
| Kesteven | +£265 | 7.64 | 1/20 | +£252 |
| Eastgate | **−£364** | −4.86 | 18/20 | −£339 |

The corridor flipped from *neutral* to *premium pays*, which is the correct
answer for a site 25 minutes from its nearest competitor and was not previously
available at any price.

### 11.2 The over-correction happened, as flagged

The risk named before implementing was Kesteven: reference £0.62, and already
the site that struggles for margin. Its optimum fell £0.85 → £0.70 and the
margin at that optimum fell **£845 → £628**.

That is the mechanism working, not misfiring — a garden centre should not
sustain corridor prices — but it lands on a site whose margin goal is £520 with
little room. **Goal re-fitting has to treat Kesteven as the binding case**, and
if it cannot be made to work without slackening the goal below the point of
being a goal, the honest conclusion is that Kesteven's reference price, not the
mechanism, is what is wrong.

### 11.3 Both mechanisms now differentiate by site

The double-count named in the pre-implementation design is real and now live:
Eastgate drivers face both a low detour-derived ceiling (£0.82) and a
dear-for-round-here soft penalty. They point the same way and compound.

It has not caused a problem — Eastgate's optimum is unchanged between A and A+B,
so the second mechanism added nothing there — but it is the first thing to
suspect if Eastgate later proves impossible to balance.
