# ChargePointOperator — Calibration Sheet & Assumptions Register

**Version:** 3.4 · **Date:** 2026-08-20 *(v2.0: rebuilt for ratified D8/D10/D14/D15 · v2.1: night-duration figure made precise · v2.2: readiness-review fixes — D21 admission/elasticity formulas with worked examples, archetype reference prices, fault model made well-formed, §4a maintenance-dominance arithmetic, §7 ranges re-derived · **v3.0: Phase 1 measurement — §7 ranges replaced by measured values (OPEN-3 closed), §4a maintenance dominance confirmed empirically, D13 floor measured as failing · v3.1: D30 trust rebalance and D31 perceived-wait noise — §5 rewritten, §7 re-measured, OPEN-4 and OPEN-5 closed · **v3.2: OPEN-2 resolved — flat call-out cost and a realistic preventive standing charge; OPEN-6 resolved — charging limits re-scoped** · **v3.3: §7 re-measured after the D35–D37 re-rating — every row of the table moved; the comparison column now carries the pre-re-rating measurement instead of the v2.2 paper guess, and the D13 paragraph is rewritten because `minTrust` is now the goal that bites** · **v3.4: D42–D45 — §3 gains the detour-derived ceiling, per-archetype value of time and the per-site detour ranges; §5's worked example re-computed and made site-specific; §7 re-measured (and barely moved, which is itself the finding); §8's price gradient becomes `up-then-down`; §9 gains A8 (2014 prices, not uprated) and A9 (detour is a range, not a road network); goals are three, not four**)*
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
| `reliabilityBase` — rapid / ultra | 0.985 / 0.975 per **session** (§5 fault model) |
| `repairSecondsMean` — rapid / ultra | 2,700 (45 sim-min) / 3,600 (60 sim-min) |
| Upgrade cost rapid→ultra | **£75,000** *(re-priced 2026-08-17; was £40,000)*. This is now a 150 → 350 kW swap, not 50 → 150. IONITY's ~€700m for 5,000+ ultra-rapid chargers puts an all-in greenfield unit near €140k; an in-place swap on a bay that already has groundwork and connection is cheaper, not £40k cheap. Realism commitment is D10. Lives in `scenario.upgradeCosts` (D20), **not** on the action. Starting capital still funds at most one; judged operationally, not by in-run payback |

*(`reservePowerKw` deleted — D23. Nothing defined what reserving power did, and with a flat energy price and a full rebalance every tick it bought nothing.)*

## 3. Vehicles & demand behaviour

| Constant | Commuter | En-route | Panic (low SOC) |
| :-- | :-- | :-- | :-- |
| Battery capacity kWh | 40–80 (mean 60) | 50–80 (mean 65) | 40–70 (mean 55) |
| **`maxChargeRateKw`** *(D15)* | 60–120 | 120–250 | 50–150 |
| Arrival SOC (fraction) | 0.35–0.55 | 0.15–0.35 | 0.03–0.12 |
| Driver-chosen target SOC | 0.80 | 0.80 | 0.60 |
| Mean energy per session | 21.0 kWh | 35.8 kWh | 28.9 kWh |
| `patienceSeconds` | 900 | 1,200 | 1,800 |
| `priceSensitivity` (0–1) | 0.7 | 0.4 | 0.1 |
| `waitSensitivity` (0–1) | 0.6 | 0.5 | 0.2 |
| `urgencyScore` (0–1) | 0.3–0.5 | 0.5–0.7 | 0.9–1.0 |
| **`referencePricePerKwh`** *(D21; **no longer read by `siteScore` — D43**)* | £0.75 | £0.85 | £1.00 |
| **`maxAcceptablePriceBase`** *(D42, was `maxAcceptablePricePerKwh`)* | **£0.78** | **£1.05** | **£1.44** |
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

**Detour ranges, per scenario (D42):** Junction 42 `[8, 30]` · Kesteven `[5, 18]` · Eastgate `[2, 7]` sim-minutes, justified against real UK rapid-charger spacing. The range's *width* is direction of approach — the next rapid is ahead of you or behind you — which is what makes refusal a curve rather than a step.

**Effective charging power (D14, D15):** `effectivePowerKw = min(bayAllocatedKw, vehicle.maxChargeRateKw) × taper(soc)` where **taper = 1.0 below 0.80 SOC, 0.4 at/above 0.80 SOC** (two-segment first guess). This is what makes the partial-charge policy a real trade: charging past 80% is slow, so a site-imposed 80% cap frees bays dramatically at peaks.

**Partial-charge policy (D14 — core):** `partialChargeTargetSoc` selectable **off / 0.70 / 0.60 / 0.50** *(re-scoped from off/0.90/0.80/0.70 — D33/OPEN-6: every driver already targets 0.80 or less, so the top two settings were exact no-ops)*. When set below a driver's own target, mild trust penalty per affected session (−0.1) — you're sending people away with less than they wanted; they mostly understand at a busy site.

## 4. Pricing & economics (realistic £ — D10)

| Constant | Value |
| :-- | :-- |
| Initial `pricePerKwh` | £0.79 (typical UK public rapid) |
| Initial `connectionFee` | £0.99 |
| Price slider range | £0.45 – £1.20 |
| `scenario.referencePricePerKwh` (elasticity pivot) | £0.79 |
| `energyCostPerKwh` | £0.28 |
| `opexPerSimDay` | £150 (rent, rates, comms) |
| **Starting capital** | **£50,000** — an investment float, not a score; the scored economic metric is operating margin (D10) |
| **Repair call-out cost** *(flat across tiers — D33)* | **£200**, whatever your contract |
| Maintenance — `reactive` | £0/day standing; fault probability ×1.25; repair time ×1.2 |
| Maintenance — `standard` (default) | £25/day contract; ×1.0 / ×1.0 |
| Maintenance — `preventive` | **£150/day** (£55k/yr = £9.1k per bay — a normal comprehensive O&M contract); fault probability ×0.5; repair time ×0.7 |

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
| Kesteven (destination, 1.5 faults/day) | **3.00** | 2.40 | **a waste of money on a site that rarely breaks** |

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

**These intercepts are now site-specific.** The same table at Eastgate (reference £0.72) or Kesteven (£0.62) has different numbers at the same £0.79, which is the entire point of D43. A commuter at £0.85 scores 0.46 at the corridor, 0.07 at Eastgate and −0.49 at Kesteven, against a threshold of 0.15 — accepted at one site, refused at the other two.

**Price and patience are now coupled.** Walk-away time used to be fixed per archetype; a commuter now holds out ~13 sim-min at the going rate, ~7 at 6p over, and will not queue at all 16p over.

That ordering is the design intent made checkable: commuters shed first — right around the 8-minute `maxAvgWaitSeconds` goal — en-route tolerate a real queue, panic arrivals take whatever they can get. **Recompute this table whenever a coefficient moves**; it is the fastest way to see whether an admission tweak has quietly emptied the queue. Raising price to £1.10 drops the commuter score below threshold at any wait (and trips their hard reject at £0.95), which is the demand-shaping lever working as designed.

| Constant | Value |
| :-- | :-- |
| Fault model | Per-tick `P(fault) = (1 − reliabilityBase) / expectedSessionTicks × maintenanceMultiplier`, evaluated only on `charging` bays, where `expectedSessionTicks = max(1, round(session.estimatedDurationSeconds / 60))` — **that session's own** estimate, taken at start. Integrates to ≈ `1 − reliabilityBase` per session, which is what `reliabilityBase` is supposed to mean. Plus the scripted fault (scenario spec §4), which no maintenance level prevents |
| Abandonment | 0 while `waited < patience`; then ramps linearly to 0.5/tick over the next 600 s |
| Trust — start / bounds | 60 / clamp 0–100, max ±5 over a **rolling** 3,600 sim-second window |
| Trust deltas *(rebalanced — **D30**)* | abandon −1.5 · fault mid-session −2.0 · fault idle −0.5 · **completion 0** · **wait < 300 s: +0.1 · wait ≥ 300 s: −0.05** (exclusive, not cumulative) · uptime (ROLL) > **98%** sustained +0.5/sim-hr · **drive-on −0.15, plus a further −0.2 when the price was above what that driver would pay (D45)** · partial-charge-capped session −0.1 (D14) |
| **Detour premium clamp** *(D42)* | `DETOUR_PREMIUM_MAX` **£0.40**. Measured: binds on 0.60% of corridor drivers (13 of 2,174 over 5 seeds) and on nobody at the other two sites, where the largest premium reached is £0.266 and £0.117. It catches the extreme tail — a 10 kWh top-up after a 30-minute detour — without collapsing anyone onto a shared ceiling |
| Perceived-wait noise *(new — **D31**)* | `perceivedWait = trueWait × U(0.65, 1.35)` — each arrival judges the wait it can see, and misjudges it (A4) |

**Why these changed (D30).** The v2.2 set was net **+42/day** under baseline play, so trust ran to the 0–100 ceiling on every competent run and stopped being a resource at all. The measured event volumes explain it: a day carries **183 completions against ~10 failures**, so any per-completion reward swamps every penalty. The structure now is *serving someone is the job* — reputation moves on the exceptional (a plug free on arrival) and on the things that actually annoy people. The **slow-completion penalty is new**, and it closes a real gap: before it, wait touched trust only when someone gave up, so a site with 20-minute queues that everyone tolerated lost no reputation at all.

*Measured:* baseline trust ends **56.4** [p10 49.6 · p90 62.2], against 96.3 before. Recompute the §5 admission table whenever these move — the trust term feeds `siteScore`, and at trust 96 it was handing every arrival +0.6 against a threshold of 0.15.

## 6. Demand waves

Wave table lives in `ChargePointOperator_Scenario_RoadsideHub.md` §3 (single source — includes the D8 overnight hours).

## 7. Output ranges — baseline policy · **MEASURED** (closes OPEN-3)

Baseline (D22) = £0.79 flat, **`standard`** maintenance, `equal_share` power, all bays open, partial-charge **off**, no upgrades, and **`schedule_repair` issued on the tick a fault is detected**.

**These are no longer guesses.** Measured over 20 seeds (`s1`–`s20`) on **2026-08-20**, after D42–D45 — `npm run baseline`. `ChargePointOperator_Phase1_Findings.md` §2 is the write-up of the *original* Phase 1 measurement and describes the pre-re-rating sim; what the re-rating moved and why is D35–D37 in the decision log. Re-measure whenever anything in §1–§5 changes; it takes **about 110 seconds** for the 20 seeds, so there is still no excuse for stale numbers here — though the loop is no longer the 23 seconds this line used to claim. D36's demand is nearly all of the difference; `batch`'s full `info` log collection accounts for only about 20 s of it (the same 20 runs with `collectLog: false` take ~89 s). **This table was stale for a day after the re-rating** — the archived batch in `runs/` still held the pre-re-rating figures, which is how a doc and its own evidence drift apart.

The middle column is the **previous measurement** (v3.3, pre-D42), not the v2.2 paper guess it used to hold. That guess was answered once, in v3.0, and §7a keeps the verdict; what matters now is what D42–D45 moved, and by how much.

**Almost nothing moved, and that is the finding.** D42 and D43 rewrote what a driver will pay and what they measure it against, and the corridor's baseline day is within noise of where it was. That is expected once stated: baseline play prices at £0.79, which **is** the corridor's reference price, so D43's price term is exactly zero and D45's penalty never fires. **These changes are invisible until the player reaches for the price lever** — which is precisely what they were built to make matter.

| KPI | **Measured** mean [p10 · p90] | v3.3 (pre-D42) | If a change moves it, suspect (in order) |
| :-- | :-- | :-- | :-- |
| Arrivals/day | **432** [408 · 459] | 428 | `DEMAND_SCALE` (D36) first, then wave rates and elasticity |
| Utilization | **63.9%** [61.3 · 67.3] | 62.9% | siteScore; bays that are faster per car offset more cars |
| Avg wait | **6.6 sim-min** [5.5 · 7.5] | 6.2 sim-min | peaks vs cap-bound capacity |
| Abandonment rate | **1.3%** [0.9 · 1.9] | 1.4% | **the gate sheds it, not the queue — see below** |
| Uptime | **95.92%** [94.80 · 97.57] | 95.70% | fault model; falls because more sessions mean more fault exposure |
| Sessions completed | **324** [312 · 343] | 316 | downstream of everything above |
| Session success rate | **98.0%** | 97.8% | fault model |
| Cumulative operating margin | **£3,701** [£3,169 · £4,445] | £3,535 | price/energy gap, maintenance, opex |
| End cash (no upgrade) | **£103,701** — reconciles exactly | £103,535 | invariant 6 if this doesn't reconcile; `initialCash` is £100,000 since D37 |
| End trust | **49.7** [41.4 · 57.6] | 48.9 | D30's deltas under D36's demand — the busier site spends more goodwill than it earns |
| Faults/day | **6.55** [3.90 · 8.10] | 7.0 | fault model is well-formed; scales with sessions, not with wall-clock |
| Rejected at gate | **97** [75 · 120] | 101 | siteScore, and after D43 the **site's** reference price |

**What D42–D45 did move is off this table**, because this table measures one site playing one price. The per-site margin optimum is now **£0.90 corridor · £0.75 commuter · £0.70 destination** where it was £0.85 on all three; +15% on list is worth +£197 at the corridor and −£364 at the commuter hub. Those live in `ChargePointOperator_PricingModel_Design.md` §11 and §14.

**On abandonment (D31).** The 8–25% expectation predates D21, which gave each archetype its own wait sensitivity. With drivers who can see a queue and leave, a competently-run six-bay site does not generate mass abandonment — the demand goes **at the gate** instead (101 rejections/day, 24% of arrivals), and the funnel accounts for it there. **The re-rating is the evidence for this, not a complication of it:** D36 nearly doubled arrivals, and the drive-past *share* moved 23% → 24% while the abandonment rate went 1.8% → 1.4%. The gate scales with demand; the queue does not have to. Adding perceived-wait noise (D31) was the right fix for *reachability* and it did not move this number much, because the admission gate is doing the shedding by design. **Treat 8–25% as a superseded guess.** The figure to watch is the funnel split, not this rate on its own.

The p10–p90 spread on margin is £1,665 wide. **Any goal set inside that band is a coin flip** — which is what the difficulty-floor result below reflects.

**Difficulty floor check (D13): measured 80% — PASSES, with no headroom.** The baseline fails ≥1 goal on **16 of 20 seeds** against D13's ≥80%. Goals are **three** since D44 — `minOperatingMargin` £3,200, `maxAvgWaitSeconds` 420 s, `minTrust` 55. Commuter is at 85% and destination at 80%.

**`minTrust` is still the goal that bites.** Met across the batch: trust **4/20**, margin **17/20**, wait **14/20**. The margin goal moved £2,800 → £3,200 under D44's re-fit because it had gone free at 20/20 — site-aware pricing lets the corridor earn more for the same traffic. That is the reverse of the pre-re-rating position, where margin bit at 4/20 and trust supported at 12/20 — and it is the outcome D36 reasoned its way to when it re-fitted every goal from the measured spread *except* `minTrust`, on the grounds that the re-rating changed the hardware but not what a good reputation is worth. The floor now rests on that single unchanged number.

Two consequences worth stating plainly. **Roadside sits exactly on the bar** where commuter and destination are at 85%, so one seed flipping puts it under — re-measure before trusting it after any change, which is D36's own warning and not a new one. And **the correlation the old text relied on has inverted**: trust and margin no longer fail together, because the busier site earns money while spending goodwill. A goal set from this table's p80 for margin (£4,087) would bite; £2,800 does not, and is carried by trust instead.

The habit still holds — set goals from this table's own distribution rather than from paper, which is what OPEN-3 established and D36 re-applied.

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
