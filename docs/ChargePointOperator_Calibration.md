# ChargePointOperator — Calibration Sheet & Assumptions Register

**Version:** 4.2 · **Date:** 2026-11-15 *(**v4.2: D65 fixed days (keyed draws, faults from a wear budget); D66 trust (drive-on −0.075, recovery, broken-bay drain); D67 goals fitted against the good-player benchmark; §7 re-measured.** · **v4.1: D59 call-out premium; D58 `queue_collapse` threshold; §7 re-measured with the D59 baseline.** · **v4.0: D46–D55 — uniform cars, driver target spread, shorter queue tolerance and patience, charging limit off/90/75/50, bay choice, faults halved, connection fee £0, contract repairs, closed bays cost nothing. §7 measured ranges are stale until the D57 re-measure.** · v2.0: rebuilt for ratified D8/D10/D14/D15 · v2.1: night-duration figure made precise · v2.2: readiness-review fixes — D21 admission/elasticity formulas with worked examples, archetype reference prices, fault model made well-formed, §4a maintenance-dominance arithmetic, §7 ranges re-derived · **v3.0: Phase 1 measurement — §7 ranges replaced by measured values (OPEN-3 closed), §4a maintenance dominance confirmed empirically, D13 floor measured as failing · v3.1: D30 trust rebalance and D31 perceived-wait noise — §5 rewritten, §7 re-measured, OPEN-4 and OPEN-5 closed · **v3.2: OPEN-2 resolved — flat call-out cost and a realistic preventive standing charge; OPEN-6 resolved — charging limits re-scoped** · **v3.3: §7 re-measured after the D35–D37 re-rating — every row of the table moved; the comparison column now carries the pre-re-rating measurement instead of the v2.2 paper guess, and the D13 paragraph is rewritten because `minTrust` is now the goal that bites** · **v3.4: D42–D45 — §3 gains the detour-derived ceiling, per-archetype value of time and the per-site detour ranges; §5's worked example re-computed and made site-specific; §7 re-measured (and barely moved, which is itself the finding); §8's price gradient becomes `up-then-down`; §9 gains A8 (2014 prices, not uprated) and A9 (detour is a range, not a road network); goals are three, not four**)*
**Companions:** `ChargePointOperator_Plan.md` (C9, O7), `ChargePointOperator_Architecture.md` (§6, §9.3), `ChargePointOperator_Decision_Log.md` (D8–D26)
**Status of every number: FIRST GUESS** — chosen for plausible ratios and gradients so Phase 1 has something to assert against and Phase 3 something to tune. When a value proves wrong, change it here first, then in code. Currency £ (realistic magnitudes — D10).

---

## 1. Time & scale (D8, D9, D26 — ratified)

| Constant | Value | Notes |
| :-- | :-- | :-- |
| Simulated period per scenario | Full day **00:00–24:00** (86,400 sim-seconds) | D8 as ratified (24h, not the originally proposed 16h) |
| Real duration per scenario | 300 real seconds (5 min) | Plan D5 |
| Time compression | **288×** | |
| Tick length (`scenario.tickSeconds`) | **60 sim-seconds** (1 sim-minute) | 1,440 ticks/run; 4.8 ticks per real second. **Fixed** — the UI speed control changes ticks-per-real-second, never tick size (D26) |
| Metric snapshot cadence | **300 sim-seconds** (5 sim-min) → 288 snapshots/run | D9 |

All `*Seconds` fields are sim-seconds at real-world magnitude (a 10-minute wait = 600). Watch-item from D8: the quiet opening runs ≈62 real seconds for the deep-night block (00:00–05:00) and ≈87 to the end of the `early` wave (07:00) — if it plays as dead air, the tuning fix is variable compression of the small hours; logged, not built.

## 2. Site & hardware (roadside hub baseline)

| Constant | Value |
| :-- | :-- |
| Bays | 6 — bays 1–4 `rapid_dc`, bays 5–6 `ultrarapid_dc` |
| `rapid_dc` / `ultrarapid_dc` maxPowerKw | **150 / 350** *(re-rated 2026-08-17)*. Was 50 / 150, which was 2019–2021 spec: current UK classification puts rapid at 100–150 kW (50 kW is the legacy tier) and ultra-rapid at 150 kW upwards, with corridor operators (IONITY, GRIDSERVE/Extra) running 350–400 kW. The old rapid tier throttled *every* car on site — the archetype table in §3 already allowed 60–250 kW. (`slow_ac` unchanged at 22 kW and still unused in MVP scenarios — D5) |
| Grid cap `gridPowerKw` | **650 kW** *(re-sized 2026-08-17)*. Nameplate is now 4×150 + 2×350 = 1,300 kW, so this is 50% of nameplate — a site connected for typical peak rather than absolute peak, which is the ordinary UK position. Industry reference points: ~1.5 MVA for a 10–12 × 150 kW hub (~83%), and a dedicated 14 MVA substation for the 32-bay Moto Tamworth super hub. **Measured**: throughput rises to ~650 kW, plateaus by ~800, and is bit-identical above it — so ≥900 kW makes `power_choke` unreachable and this is the top of the useful band |
| `maxQueueLength` | **12** *(new — D20)*. Two deep per bay. Makes the `site_full` leave reason reachable; previously it was a type value nothing could produce |
| `reliabilityBase` — AC / rapid / ultra | **0.995 / 0.9925 / 0.9875** per **session** (§5 fault model) *(D51: unreliability halved, was 0.99 / 0.985 / 0.975; measured 5.3 faults/day at Junction 42 before)* |
| `repairSecondsMean` — rapid / ultra | 2,700 (45 sim-min) / 3,600 (60 sim-min) |
| Upgrade cost rapid→ultra | **£75,000** *(re-priced 2026-08-17; was £40,000)*. This is now a 150 → 350 kW swap, not 50 → 150. IONITY's ~€700m for 5,000+ ultra-rapid chargers puts an all-in greenfield unit near €140k; an in-place swap on a bay that already has groundwork and connection is cheaper, not £40k cheap. Realism commitment is D10. Lives in `scenario.upgradeCosts` (D20), **not** on the action. Starting capital still funds at most one; judged operationally, not by in-run payback |

*(`reservePowerKw` deleted — D23. Nothing defined what reserving power did, and with a flat energy price and a full rebalance every tick it bought nothing.)*

## 3. Vehicles & demand behaviour

| Constant | Commuter | En-route | Panic (low SOC) |
| :-- | :-- | :-- | :-- |
| Battery capacity kWh | **40–80 (mean 60), every type** *(D46; was 40–80 / 50–80 / 40–70)* | ← | ← |
| **`maxChargeRateKw`** *(D15)* | **50–250, every type** *(D46; was 60–120 / 120–250 / 50–150)* | ← | ← |
| Arrival SOC (fraction) | 0.35–0.55 | 0.15–0.35 | 0.03–0.12 |
| Driver-chosen target SOC *(D47: drawn per driver)* | **0.80–0.90** | **0.80–1.00** | **0.60–0.80** |
| Mean energy per session (requested) | 24.0 kWh | 39.0 kWh | 37.5 kWh |
| `patienceSeconds` *(D49)* | **480** | **720** | **1,200** |
| `priceSensitivity` (0–1) | 0.7 | 0.4 | 0.1 |
| `waitSensitivity` *(D48)* | **1.3** | **1.05** | **0.875** |
| Longest queue joined (mid urgency, reference price, trust 50) | 5 min | 10 min | 20 min |
| `urgencyScore` (0–1) | 0.3–0.5 | 0.5–0.7 | 0.9–1.0 |
| **`referencePricePerKwh`** *(D21; **no longer read by `siteScore` — D43**)* | £0.75 | £0.85 | £1.00 |
| **`maxAcceptablePriceBase`** *(D42; re-derived for D46/D47, was £0.78 / £1.05 / £1.44)* | **£0.80** | **£1.06** | **£1.46** |
| **`valueOfTimePerHour`** *(new — D42)* | **£11.21** | **£5.12** | **£5.12** |

**The ceiling is no longer a constant (D42).** `maxAcceptablePriceBase` is what this archetype would pay **with a competing charger right there** — no detour, no captivity. Each driver adds a premium on top, drawn from their own detour to the nearest alternative:

```
premium = (detourMinutes / 60 × valueOfTimePerHour) / requestedKwh     [clamped to ≤ £0.40]
ceiling = maxAcceptablePriceBase + premium
```

The bases are **derived, not chosen**: each is the old ceiling (0.95 / 1.10 / 1.50) minus the premium a Junction-42-typical detour of 19 sim-min buys for that archetype at its mean session energy. The corridor therefore keeps the tolerance it had, and differentiation comes from the other two sites being less captive.

**Value of time** is from the DfT VTT study (Arup / ITS Leeds / Accent for DfT, Aug 2015), Table 5.1, **2014 perceived prices**: commute £11.21/hr, other non-work £5.12/hr. Perceived rather than market prices is the correct basis — this stands in for what a driver believes their own time is worth while deciding to drive on. Per archetype rather than one global constant because TAG publishes two figures and the archetypes map onto both. **Not uprated from 2014** — see §9.

*Counterintuitive and left in:* commuters get the **larger** premium — higher value of time, spread over a smaller top-up — while en-route drivers get the smaller one. Site differentiation comes from detour minutes, not from who turns up.

**The archetype reference price** is still where each archetype starts grumbling, but **D43 removed it from `siteScore`**, which now uses the *site's* reference. It survives only as the anchor the bases were sanity-checked against.

**Detour ranges, per scenario (D42):** Junction 42 `[8, 30]` · Trevithick `[5, 18]` · Eastgate `[2, 7]` sim-minutes, justified against real UK rapid-charger spacing. The range's *width* is direction of approach — the next rapid is ahead of you or behind you — which is what makes refusal a curve rather than a step.

**Effective charging power (D14, D15):** `effectivePowerKw = min(bayAllocatedKw, vehicle.maxChargeRateKw) × taper(soc)` where **taper = 1.0 below 0.80 SOC, 0.4 at/above 0.80 SOC** (two-segment first guess). **Since D47 it applies:** drivers targeting above 0.80 charge their last stretch at 40% speed. Before D47 no driver targeted above 0.80, so it never did. Charging is otherwise flat (no curve), by choice (D47).

**Bay choice (D50):** a driver placed on a bay takes the free bay with the highest `min(bay kW, car kW)`; on a tie, the smallest bay; then bay order. The queue is first-come, first-served.

**Partial-charge policy (D14 — core):** `partialChargeTargetSoc` selectable **off / 0.90 / 0.75 / 0.50** *(D49; was off / 0.70 / 0.60 / 0.50, itself re-scoped by D33/OPEN-6 when every driver targeted 0.80 or less. D47's target spread is what makes 0.90 do something)*. When set below a driver's own target, mild trust penalty per affected session (−0.1) — you're sending people away with less than they wanted; they mostly understand at a busy site.

## 4. Pricing & economics (realistic £ — D10)

| Constant | Value |
| :-- | :-- |
| Initial `pricePerKwh` | £0.79 (typical UK public rapid) |
| Initial `connectionFee` | **£0, every scenario, and hidden from the UI** *(D52; was £0.99 here, £0.50 at Eastgate)*. The mechanic stays for later use. |
| Price slider range | £0.45 – £1.20 |
| `scenario.referencePricePerKwh` (elasticity pivot) | £0.79 |
| `energyCostPerKwh` | £0.28 |
| `opexPerSimDay` | £150 (rent, rates, comms). **Charged in proportion to open bays (D54)**, as is the standing maintenance charge |
| **Starting capital** | **£100,000** *(raised 2026-08-17 with the £75k upgrade)* — an investment float, not a score; the scored economic metric is operating margin (D10) |
| **Repair call-out cost** *(flat across tiers — D33)* | **£200**, whatever your contract. **D59:** a player call-out on `standard` / `preventive` adds `CALL_OUT_PREMIUM` **£100** (£300) for jumping the contractor; the contractor's own repair and every `reactive` call-out stay £200 |
| Maintenance — `reactive` | £0/day standing; fault probability ×1.25; repair time ×1.2; **no contract: the player calls out every repair** |
| Maintenance — `standard` (default) | £25/day contract; ×1.0 / ×1.0; **contractor dispatched after 30 min** *(D53)* |
| Maintenance — `preventive` | **£150/day** (£55k/yr = £9.1k per bay — a normal comprehensive O&M contract); fault probability ×0.5; repair time ×0.7; **contractor dispatched after 15 min** *(D53)* |

**Price elasticity — `AMENDED (D21)`.** v2.1 hard-coded a coefficient of 1.2 here while `DemandWave.priceElasticity` independently varied 0.7–1.2, and never said how the two combined. **The wave value *is* the coefficient.** One formula:

```
priceMultiplier = clamp(1 − wave.priceElasticity × (price − 0.79) / 0.79, 0.3, 1.5)
effectiveArrivalRatePerMinute = wave.arrivalRatePerMinute × priceMultiplier
```

Per-archetype `maxAcceptablePricePerKwh` hard rejections apply on top, at admission. Still expected to be the most-tuned constant in the project.

### 4a. Maintenance tiers — **dominance resolved (D33)**

The tiers used to price the same call-out at £300 / £200 / £150, which paid preventive **twice**: fewer faults *and* a discount on each one. Removing that double-count is what made the fix affordable — the break-even standing charge fell from ~£460/day (which genuinely did break D10) to a figure inside normal contract pricing.

**Measured after, 10 seeds per cell — the sign now varies by site, which is the trade the mechanic was always supposed to be:**

| Site | as-shipped | preventive | Verdict |
| :-- | --: | --: | :-- |
| Junction 42 (corridor, 3.7 faults/day) | 2.90 goals | **3.40 goals** | buying reliability pays where things break |
| Eastgate (commuter, 2.1 faults/day) | 2.70 | 2.90 | marginal |
| Trevithick (destination, 1.5 faults/day) | **3.00** | 2.40 | **a waste of money on a site that rarely breaks** |

Before D33 the dominant-strategy test returned two winners, both containing `preventive`. It now returns **three distinct winners** — `preventive`, `premium+preventive`, `premium` — and preventive alone is the third-worst strategy on the quiet site.

*(Historical note: this section previously argued the dominance could only be fixed by breaking realism or adding a new mechanic. That was true of the pricing as it then stood, and false once the call-out ladder was flattened. The arithmetic was right; the option set was incomplete.)*

## 5. Behavioural & system constants

**Admission (`siteScore`) — `AMENDED (D21)`.** The per-archetype `priceSensitivity` and `waitSensitivity` above were calibrated in v2.0 and then read by nothing: the formula used flat global coefficients, so all three archetypes admitted identically. They are now the point of the formula.

```
siteScore = a × urgencyScore
          − b × waitSensitivity  × (expectedWaitSeconds / 600)
          − c × priceSensitivity × ((price − archetypeReferencePrice) / 0.10)
          + d × ((trust − 50) / 25)
```

| Coefficient | Value |
| :-- | :-- |
| `a` (urgency) | 2.0 |
| `b` (wait, per 600 s) | 1.0 |
| `c` (price, per £0.10 over **site** reference — D43, was archetype) | 0.8 |
| `d` (trust, per 25 points over 50) | 0.3 |
| `ACCEPT_THRESHOLD` | 0.15 |

**Worked example — the wait at which each archetype walks away** (price £0.79, trust 60, mean urgency):

| Archetype | siteScore | Rejects above |
| :-- | :-- | :-- |
| Commuter | `0.920 − 0.00100 × wait` | **≈ 13 sim-min** |
| En-route | `1.320 − 0.00083 × wait` | ≈ 23 sim-min |
| Panic | `2.020 − 0.00033 × wait` | ≈ 94 sim-min (effectively never) |

**Re-computed for D43**, at Junction 42 and £0.79 — which **is** the corridor's reference price, so the price term is exactly zero here and these intercepts are urgency and trust alone. They previously carried a per-archetype price offset (+0.224 / +0.192 / +0.168) that had no business being site-independent, which is why commuters were shown shedding at ~9 sim-min and now hold out to ~13.

**These intercepts are now site-specific.** The same table at Eastgate (reference £0.72) or Trevithick (£0.62) has different numbers at the same £0.79, which is the entire point of D43. A commuter at £0.85 scores 0.46 at the corridor, 0.07 at Eastgate and −0.49 at Trevithick, against a threshold of 0.15 — accepted at one site, refused at the other two.

**Price and patience are now coupled.** Walk-away time used to be fixed per archetype; a commuter now holds out ~13 sim-min at the going rate, ~7 at 6p over, and will not queue at all 16p over.

That ordering is the design intent made checkable: commuters shed first — right around the 8-minute `maxAvgWaitSeconds` goal — en-route tolerate a real queue, panic arrivals take whatever they can get. **Recompute this table whenever a coefficient moves**; it is the fastest way to see whether an admission tweak has quietly emptied the queue. Raising price to £1.10 drops the commuter score below threshold at any wait (and trips their hard reject at £0.95), which is the demand-shaping lever working as designed.

| Constant | Value |
| :-- | :-- |
| Fault model *(D65: wear budget)* | Per-tick hazard `h = (1 − reliabilityBase) / expectedSessionTicks × maintenanceMultiplier`, accrued only on `charging` bays, where `expectedSessionTicks = max(1, round(session.estimatedDurationSeconds / 60))` — **that session's own** estimate, taken at start. Each bay carries `wear` and a `wearLimit` drawn from the seed (exponential, mean 1, keyed by bay and fault count); it faults when `wear ≥ wearLimit`, then resets and draws the next limit. Same average rate as testing `h` each tick (≈ `1 − reliabilityBase` per session), but a change in play moves a fault rather than deciding whether it happens. Plus the scripted fault (scenario spec §4), which no maintenance level prevents |
| Abandonment | 0 while `waited < patience`; then ramps linearly to 0.5/tick over the next 600 s |
| Trust — start / bounds | 60 / clamp 0–100, max ±5 over a **rolling** 3,600 sim-second window |
| Trust deltas *(rebalanced — **D30**, **D66**)* | abandon −1.5 · fault mid-session −2.0 · fault idle −0.5 · **completion 0** · **wait < 300 s: +0.1 · wait ≥ 300 s: −0.05** (exclusive, not cumulative) · uptime (ROLL) > **98%** sustained +0.5/sim-hr · **drive-on −0.075** *(D66; was −0.15)*, plus a further −0.2 when the price was above what that driver would pay (D45) · partial-charge-capped session −0.1 (D14) · **each faulted bay left open −2/sim-hr until repaired or closed (D66)** |
| **Trust recovery** *(D66)* | While trust is below the starting level **and no open bay is faulted**, it closes **25% of the gap per sim-hour**, inside the ±5 clamp. One-way: never pulls trust down |
| **Randomness** *(D65)* | Every draw is keyed off the seed and what it is for (arrivals per minute; each car by minute and place; perception and abandonment per car; wear per bay). Random faults: each bay draws a wear budget (exponential, mean 1) and faults when the per-tick hazard, summed over charging minutes, reaches it |
| **Detour premium clamp** *(D42)* | `DETOUR_PREMIUM_MAX` **£0.40**. Measured: binds on 0.60% of corridor drivers (13 of 2,174 over 5 seeds) and on nobody at the other two sites, where the largest premium reached is £0.266 and £0.117. It catches the extreme tail — a 10 kWh top-up after a 30-minute detour — without collapsing anyone onto a shared ceiling |
| Perceived-wait noise *(new — **D31**)* | `perceivedWait = trueWait × U(0.65, 1.35)` — each arrival judges the wait it can see, and misjudges it (A4) |

**Why these changed (D30).** The v2.2 set was net **+42/day** under baseline play, so trust ran to the 0–100 ceiling on every competent run and stopped being a resource at all. The measured event volumes explain it: a day carries **183 completions against ~10 failures**, so any per-completion reward swamps every penalty. The structure now is *serving someone is the job* — reputation moves on the exceptional (a plug free on arrival) and on the things that actually annoy people. The **slow-completion penalty is new**, and it closes a real gap: before it, wait touched trust only when someone gave up, so a site with 20-minute queues that everyone tolerated lost no reputation at all.

*Measured:* baseline trust ends **56.4** [p10 49.6 · p90 62.2], against 96.3 before. Recompute the §5 admission table whenever these move — the trust term feeds `siteScore`, and at trust 96 it was handing every arrival +0.6 against a threshold of 0.15.

## 6. Demand waves

Wave table lives in `ChargePointOperator_Scenario_RoadsideHub.md` §3 (single source — includes the D8 overnight hours).

## 7. Output ranges — baseline policy · **MEASURED** (closes OPEN-3) · **re-measured for D65–D67 (v4.2)**

Baseline (D22, amended by D59) = list price flat, **`standard`** maintenance, `equal_share` power, all bays open, charging limit **off**, no upgrades. Faults are repaired by the **D53 contractor** after 30 min; on `reactive` the baseline calls the repair out on the tick the fault is detected.

Measured over 40 seeds (`s1`–`s40`) on **2026-11-15**, after D65–D67. **Every seed is a different day from v4.1's** (D65 changed how draws are made), so compare distributions, not seeds. The middle column is v4.1 (20 seeds, 2026-11-13).

| KPI — Junction 42 | **Measured** p50 [p10 · p90] | v4.1 p50 | If a change moves it, suspect (in order) |
| :-- | :-- | :-- | :-- |
| Arrivals/day | **435** [411 · 462] | ~430 | `DEMAND_SCALE` (D36), then wave rates and elasticity |
| Drive-ons at the entrance | **148** a day (34%) | 35.7% | D48's queue tolerance |
| Avg wait | **3.6 sim-min** [3.2 · 4.0] | 3.6 | D48/D49, then peaks vs capacity |
| Abandonment rate | **1.1%** [0.6 · 1.7] | 1.1% | patience (D49) |
| Uptime | **96.3%** [94.8 · 98.1] | 97.1% | faults and the contractor's 30 min |
| Faults/day (incl. scripted) | **4** [2 · 6], mean 3.70 | 3 | D51; D65's wear budget keeps the mean (3.55 before) |
| Sessions completed | **279** [268 · 295] | 273 | downstream of drive-ons |
| Cumulative operating margin | **£3,893** [£3,528 · £4,323] | £4,074 | sessions × price |
| End trust | **62.0** [58.8 · 64.5] | 54.1 | **D66**: drive-on penalty halved, recovery |

Eastgate p50: margin £1,176 · wait 1.6 min · trust 69.3 · drive-ons 62 a day. Trevithick p50: margin £392 · wait 3.2 min · trust 65.6 · drive-ons 61 a day.

**Goals (D67) and how often each is met by the baseline:**

| Site | Goals: margin / wait / trust | Margin | Wait | Trust | D13 floor (fails ≥1) |
| :-- | :-- | --: | --: | --: | --: |
| Junction 42 | £4,550 / 210 s / 55 | 3% | 33% | **100%** | 100% |
| Eastgate | £1,200 / 120 s / 73 | 45% | 98% | 20% | 83% |
| Trevithick | £475 / 200 s / 63 | 10% | 57% | 85% | 93% |

**Winnability (D67), the other side of D13:** the good-player benchmark wins **63%** at Junction 42 and **66%** at Eastgate (80 fresh days each), and **85%** at Trevithick (40 days). The baseline wins 1%, 9% and 5%.

*Note:* Junction 42's trust goal no longer bites for the baseline (met 40/40) since D66 lifted its trust. The site is hard through margin. Raising it to ~60 is open (D67).

The habit still holds: set goals from measured distributions rather than from paper (OPEN-3, D36). D67 adds the second distribution, a good player's, to fit against.

### 7a. Where the pre-measurement estimates came from — **read before tuning anything**

*(Retained as the derivation that the measured table above is checked against. Its arithmetic held up well: predicted 239 arrivals vs 235 measured, 28.0 kWh/session vs 28.9, 150–190 sessions vs 183. Where it was wrong — abandonment and trust — the findings note explains why, and the cause was a mechanic interaction, not the arithmetic.)*

v2.1's ranges did not follow from v2.1's own inputs: 105–150 sessions at 28 kWh each cannot produce £1,900 of margin under any combination of the stated costs (the arithmetic tops out near £1,500). The ranges above are re-derived; the derivation is here so the next person can check it rather than inherit it.

**Demand mix** (weighted across the §3 wave table, 239 arrivals/day): 107 commuter · 93 en-route · 39 panic → **mean 28.0 kWh/session, 6,703 kWh/day of demand**.

> **STALE as of the 2026-08-17 re-rating.** Everything from here to the end of this section was derived against 50/150 kW bays, a 350 kW cap and the unscaled wave table. All three moved (see §2 and the ×1.8 `DEMAND_SCALE` in `roadsideHub.ts`), so the arithmetic below no longer describes the scenario — the measured baseline is now 428 arrivals, 316 sessions, 9,413 kWh and £3,535 margin. It is left in place unrewritten because it is the *derivation*, not the measurement, and re-deriving it is a deliberate exercise rather than a find-and-replace. The measured table above it is the live figure.

**Capacity.** The 350 kW cap delivers 8,400 kWh/day, so on a whole-day basis there is comfortably enough energy — the constraint is purely *temporal*. Three windows run a deficit:

| Window | Demand | Cap delivers | Deficit | Absorbed by |
| :-- | :-- | :-- | :-- | :-- |
| `am-commute` 07:00–09:30 | 1,048 kWh | 875 kWh | 173 | `mid-lull` (196 spare) |
| `midday` 11:30–14:00 *(scripted fault from 12:30)* | 1,395 kWh | ~838 kWh | 557 | `pm-lull` (92 spare) → **~465 kWh lost ≈ 15 sessions** |
| `pm-peak` 16:30–19:00 | 1,433 kWh | 875 kWh | 558 | `evening` (402 spare) → **~156 kWh lost ≈ 6 sessions** |

So ≈21 sessions are lost to the energy wall outright, and the queueing that produces costs another ~25–45 to admission rejection (commuters walk at ~9 sim-min — §5) and abandonment. **239 − 21 − ~35 ≈ 155–190 completed.**

**Margin** at 170 sessions: revenue `4,760 kWh × £0.79 + 170 × £0.99` = £3,928 · energy `£1,333` · maintenance `£25 + 4.4 × £200` = £905 · opex `£150` → **£1,540**. The 150/190-session ends of the range give £1,316 and £1,766.

**Three things this derivation does not settle**, and which the Phase 1 seed batch must measure rather than assume:

1. **Sessions completed** is the least trustworthy figure here — it depends on the admission cutoffs in §5, which are themselves first guesses. Everything economic hangs off it.
2. **`minOperatingMargin` = £1,750** sits inside the baseline band rather than above it. The D13 floor is satisfied (~85–90% of seeds fail it), but only just, and it is sensitive to the session count. Re-set the goal from the measured distribution; don't defend the guess.
3. **Maintenance-tier dominance** (§4a) is unresolved by design and will distort any sweep that lets the policy vary.

**On "means" vs per-seed spread:** this table states cross-seed *means*, but D13's floor check and the end-cash reconciliation are both per-run. Phase 1 should report mean **and** p10/p90 per KPI — a mean inside the band tells you nothing about whether 30% of seeds are wild.

## 8. Sanity gradients (Phase 3 sweeps must show)

| Input ↑ | Must produce |
| :-- | :-- |
| `pricePerKwh` | arrivals ↓, wait ↓, **margin/session rises to an interior peak then falls** *(D43 — see below)*, trust ↘ mild |
| Arrival rate | queue ↑, abandonment ↑, utilization ↑ then plateau |
| Fault probability | uptime ↓, session success ↓, trust ↓ |
| `patienceSeconds` | abandonment ↓, avg wait ↑ |
| Maintenance → preventive | uptime ↑ **everywhere**; margin's **sign is archetype-dependent by design** (D33) — up on a busy site, down on a quiet one. A single-scenario sweep cannot express that; the dominant-strategy test is what checks it |
| Grid cap | throughput ↑ until bay-limited, then flat |
| Partial-charge target ↓ (D14) | kWh/session ↓, sessions/hr ↑ **at peaks**, wait ↓, trust ↘ mild; **negligible effect off-peak** (the signature that the taper is working) |
| Power policy `equal_share` → `queue_relief` (D23) | avg wait ↓, sessions/hr ↑ at peaks, kWh unchanged — it reorders service, it doesn't create power |

**The price gradient changed shape under D42/D43, and the axis changed with it.** "margin/session ↑" was only ever true because the shipped sweep stopped at £0.89, below the price at which drivers refuse. Across the full £0.45–£1.20 range at £0.05 steps there is a peak, and **where that peak sits now differs by site** — £0.90 at the corridor, £0.75 at the commuter hub, £0.70 at the destination. The axis asserts `up-then-down`: that an interior optimum *exists*. That is a stronger claim about the model than monotonicity was, and it is the one the pricing decision rests on.

Flat or inverted gradient = finding-killer: stop and fix before believing anything.

---

## 9. Assumptions register

| # | Assumption | Distortion | Disposition |
| :-- | :-- | :-- | :-- |
| A1 | **Two-segment charging taper** (100% power to 0.80 SOC, then 40%) rather than a real charge curve | Real tapering starts earlier and is smooth; step function slightly overstates sub-80% speed | *(Rewritten under D14 — was "no taper at all")* Accept; refine to multi-segment in Phase 3 only if partial-charge tuning demands it |
| A2 | ~~Vehicles accept full bay power~~ | — | **Resolved by D15** (`maxChargeRateKw`) |
| A3 | **FCFS queue only** — no reservations or app pre-booking | Real CPOs shape queues via apps | Deliberate MVP cut; Phase 5 |
| A4 | **Perfect driver information** at decision time | Overstates demand elasticity | Accept; add noise to `expectedWait` if admission feels twitchy |
| A5 | **Universal connector compatibility** | Ignores CCS/AC split | Accept; `preferredChargerTypes` exists if needed. *Note: the tick pseudocode still calls `findCompatibleFreeCharger`/`dequeueCompatibleEV` — under A5 these are identity filters, kept as the seam where compatibility would land* |
| A6 | **Independent random faults** | Understates correlated failures | Accept; scripted faults partially compensate; Phase 5 events |
| A7 | **Trust is within-run only** | No reputation carry-over | Deliberate; Phase 5 campaign |
| A8 | **Value of time is 2014 perceived prices, not uprated** (D42) — DfT VTT study Table 5.1, commute £11.21/hr, other non-work £5.12/hr | Understates every detour premium by roughly a decade of inflation, so drivers are modelled as *less* tolerant of price than they would be at current prices | Accept — the distortion is in the conservative direction. Replace when an uprating factor can be sourced from the TAG databook rather than assumed |
| A9 | **Detour minutes are a per-site range, not a real road network** (D42) | A driver's alternative really depends on where they are going, not a draw from a distribution; direction of approach is the justification for the range's width rather than a modelled entity | Accept; the range is checkable against real charger spacing, which a free multiplier would not be |
| A8 | **Realistic absolute economics; capex payback exceeds one scenario** *(rewritten under D10)* | An upgrade can never "pay for itself" inside a run; naive players may read it as always-bad | Handled by design: margin excludes capex (D12), upgrades judged operationally, dashboard shows the upgrade's throughput/wait effect — never an in-run ROI figure. Do not add a payback readout; it would always say "don't". **See scenario spec §5a — under a binding grid cap the upgrade's value is genuinely narrow, and that needs testing, not assertion** |
| A9 | **288× compression with real-magnitude constants** | UI pacing must be tuned in real seconds, separately from sim constants | Accept (per D8) |
| A10 | **Flat energy price** — no ToU/demand charges | Removes real peak-shaving dynamics; slightly flatters night charging under D8's 24h day | Deliberate MVP cut; ToU is the natural Phase 5 grid mechanic and pairs well with the 24h clock. *(Also why `reservePowerKw` was cut — D23: with no ToU there is nothing to reserve power **for**)* |
| A11 | **No weather / seasonality / cold-battery effects** | Misses classic demand spikes | Phase 5 events |
| A12 | **Abandoned drivers vanish** — no retry, no word-of-mouth beyond trust | Trust proxies crudely | Accept |
| A13 | **Maintenance tiers priced for realism, not balance** *(new — readiness review)* | `preventive` is currently cost-dominant, not a trade (§4a) | **Unresolved — OPEN-2.** The only cost-only fix breaks D10's realism commitment; the alternative (scheduled maintenance windows) is a new mechanic. Decide in Phase 3 |
| A14 | **Repairs are unlimited and instant to dispatch** *(new — readiness review)* | No technician availability, travel time or queueing; a six-bay pile-up repairs as fast as a single fault | Deliberate MVP cut (Architecture §4.4). Constraining it is the natural way to make `reliability_spiral` bite harder, and pairs with A13's scheduled-window option |

---

*Change control: §1–§5 constant edits are routine. §9 assumption changes are model changes — decision log first.*
