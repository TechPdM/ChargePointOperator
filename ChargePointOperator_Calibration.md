# ChargePointOperator — Calibration Sheet & Assumptions Register

**Version:** 3.1 · **Date:** 2026-08-16 *(v2.0: rebuilt for ratified D8/D10/D14/D15 · v2.1: night-duration figure made precise · v2.2: readiness-review fixes — D21 admission/elasticity formulas with worked examples, archetype reference prices, fault model made well-formed, §4a maintenance-dominance arithmetic, §7 ranges re-derived · **v3.0: Phase 1 measurement — §7 ranges replaced by measured values (OPEN-3 closed), §4a maintenance dominance confirmed empirically, D13 floor measured as failing · v3.1: D30 trust rebalance and D31 perceived-wait noise — §5 rewritten, §7 re-measured, OPEN-4 and OPEN-5 closed**)*
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
| `rapid_dc` / `ultrarapid_dc` maxPowerKw | 50 / 150 (`slow_ac` unused in MVP scenarios — D5) |
| Grid cap `gridPowerKw` | **350 kW** — full simultaneous demand is 500 kW; the cap is designed to bind at peaks (scenario spec §3) |
| `maxQueueLength` | **12** *(new — D20)*. Two deep per bay. Makes the `site_full` leave reason reachable; previously it was a type value nothing could produce |
| `reliabilityBase` — rapid / ultra | 0.985 / 0.975 per **session** (§5 fault model) |
| `repairSecondsMean` — rapid / ultra | 2,700 (45 sim-min) / 3,600 (60 sim-min) |
| Upgrade cost rapid→ultra | **£40,000** (realistic — D10). Lives in `scenario.upgradeCosts` (D20), **not** on the action. Starting capital funds at most one; judged operationally, not by in-run payback |

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
| **`referencePricePerKwh`** *(new — D21)* | **£0.75** | **£0.85** | **£1.00** |
| `maxAcceptablePricePerKwh` (hard reject) | £0.95 | £1.10 | £1.50 |

**The archetype reference price is new because it was missing.** v2.1's `siteScore` said `c = 0.4 per £0.10 above archetype reference` and then defined no reference anywhere — the coefficient had nothing to multiply. It sits below each archetype's hard-reject ceiling: the reference is where they start grumbling, the ceiling is where they leave regardless.

**Effective charging power (D14, D15):** `effectivePowerKw = min(bayAllocatedKw, vehicle.maxChargeRateKw) × taper(soc)` where **taper = 1.0 below 0.80 SOC, 0.4 at/above 0.80 SOC** (two-segment first guess). This is what makes the partial-charge policy a real trade: charging past 80% is slow, so a site-imposed 80% cap frees bays dramatically at peaks.

**Partial-charge policy (D14 — core):** `partialChargeTargetSoc` selectable off / 0.90 / 0.80 / 0.70. When set below a driver's own target, mild trust penalty per affected session (−0.1) — you're sending people away with less than they wanted; they mostly understand at a busy site.

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
| Maintenance — `reactive` | £0/day standing; £300 per call-out; fault probability ×1.25; repair time ×1.2 |
| Maintenance — `standard` (default) | £25/day contract; £200 per repair; ×1.0 / ×1.0 |
| Maintenance — `preventive` | £45/day; £150 per repair; fault probability ×0.5; repair time ×0.7 |

**Price elasticity — `AMENDED (D21)`.** v2.1 hard-coded a coefficient of 1.2 here while `DemandWave.priceElasticity` independently varied 0.7–1.2, and never said how the two combined. **The wave value *is* the coefficient.** One formula:

```
priceMultiplier = clamp(1 − wave.priceElasticity × (price − 0.79) / 0.79, 0.3, 1.5)
effectiveArrivalRatePerMinute = wave.arrivalRatePerMinute × priceMultiplier
```

Per-archetype `maxAcceptablePricePerKwh` hard rejections apply on top, at admission. Still expected to be the most-tuned constant in the project.

### 4a. Maintenance-tier dominance — **confirmed by measurement** (OPEN-2)

The tiers above do not form a trade. **Measured, 20 seeds per tier, re-run after D30/D31:**

| Tier | Faults/day | Uptime | Sessions | **Cum margin** | Trust |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `reactive` | 5.75 | 95.54% | 175 | **£942** | 52.8 |
| `standard` | 4.35 | 97.15% | 178 | **£1,815** | 56.4 |
| `preventive` | 2.65 | 98.73% | 178 | **£2,229** | 60.8 |

`preventive` is **£414/day better on margin** than `standard` *and* better on uptime, trust and throughput simultaneously. That is a strictly dominant option, and gate criterion 2 ("no dominant strategy") is exactly what it threatens. The v2.2 first-guess arithmetic below predicted this to within ~£20/day, so the model is behaving; it is the prices that are wrong.

It has deliberately **not** been silently repriced. The measured break-even standing charge is **~£460/day** (£45 current + £414 of advantage) — close to the estimate below, confirmed twice under different trust models. For preventive to merely break even on cost, its standing charge would need to be ~£500/day — £182k/year on a six-bay site, which breaks the realistic-magnitudes commitment Mark ratified in D10. That's a decision, not a tune. The two candidate fixes are in OPEN-2: accept a balance-over-realism exception for the maintenance tiers, or give preventive a real cost in bay-time (scheduled maintenance windows), which is a new mechanic. **Resolve in Phase 3, with measured fault rates in hand.** Until then, expect every competent player to pick preventive and every sweep to say so.

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
| `c` (price, per £0.10 over archetype reference) | 0.8 |
| `d` (trust, per 25 points over 50) | 0.3 |
| `ACCEPT_THRESHOLD` | 0.15 |

**Worked example — the wait at which each archetype walks away** (price £0.79, trust 60, mean urgency):

| Archetype | siteScore | Rejects above |
| :-- | :-- | :-- |
| Commuter | `0.696 − 0.00100 × wait` | **≈ 9 sim-min** |
| En-route | `1.512 − 0.00083 × wait` | ≈ 27 sim-min |
| Panic | `2.188 − 0.00033 × wait` | ≈ 102 sim-min (effectively never) |

That ordering is the design intent made checkable: commuters shed first — right around the 8-minute `maxAvgWaitSeconds` goal — en-route tolerate a real queue, panic arrivals take whatever they can get. **Recompute this table whenever a coefficient moves**; it is the fastest way to see whether an admission tweak has quietly emptied the queue. Raising price to £1.10 drops the commuter score below threshold at any wait (and trips their hard reject at £0.95), which is the demand-shaping lever working as designed.

| Constant | Value |
| :-- | :-- |
| Fault model | Per-tick `P(fault) = (1 − reliabilityBase) / expectedSessionTicks × maintenanceMultiplier`, evaluated only on `charging` bays, where `expectedSessionTicks = max(1, round(session.estimatedDurationSeconds / 60))` — **that session's own** estimate, taken at start. Integrates to ≈ `1 − reliabilityBase` per session, which is what `reliabilityBase` is supposed to mean. Plus the scripted fault (scenario spec §4), which no maintenance level prevents |
| Abandonment | 0 while `waited < patience`; then ramps linearly to 0.5/tick over the next 600 s |
| Trust — start / bounds | 60 / clamp 0–100, max ±5 over a **rolling** 3,600 sim-second window |
| Trust deltas *(rebalanced — **D30**)* | abandon −1.5 · fault mid-session −2.0 · fault idle −0.5 · **completion 0** · **wait < 300 s: +0.1 · wait ≥ 300 s: −0.05** (exclusive, not cumulative) · uptime (ROLL) > **98%** sustained +0.5/sim-hr · price-rejection **−0.15** · partial-charge-capped session −0.1 (D14) |
| Perceived-wait noise *(new — **D31**)* | `perceivedWait = trueWait × U(0.65, 1.35)` — each arrival judges the wait it can see, and misjudges it (A4) |

**Why these changed (D30).** The v2.2 set was net **+42/day** under baseline play, so trust ran to the 0–100 ceiling on every competent run and stopped being a resource at all. The measured event volumes explain it: a day carries **183 completions against ~10 failures**, so any per-completion reward swamps every penalty. The structure now is *serving someone is the job* — reputation moves on the exceptional (a plug free on arrival) and on the things that actually annoy people. The **slow-completion penalty is new**, and it closes a real gap: before it, wait touched trust only when someone gave up, so a site with 20-minute queues that everyone tolerated lost no reputation at all.

*Measured:* baseline trust ends **56.4** [p10 49.6 · p90 62.2], against 96.3 before. Recompute the §5 admission table whenever these move — the trust term feeds `siteScore`, and at trust 96 it was handing every arrival +0.6 against a threshold of 0.15.

## 6. Demand waves

Wave table lives in `ChargePointOperator_Scenario_RoadsideHub.md` §3 (single source — includes the D8 overnight hours).

## 7. Output ranges — baseline policy · **MEASURED, Phase 1** (closes OPEN-3)

Baseline (D22) = £0.79 flat, **`standard`** maintenance, `equal_share` power, all bays open, partial-charge **off**, no upgrades, and **`schedule_repair` issued on the tick a fault is detected**.

**These are no longer guesses.** Measured over 20 seeds (`s1`–`s20`) with the Phase 1 headless core on 2026-08-16 — `npm run baseline`. Full write-up: `ChargePointOperator_Phase1_Findings.md` §2. Re-measure whenever anything in §1–§5 changes; it takes 23 seconds, so there is no excuse for stale numbers here.

| KPI | **Measured** mean [p10 · p90] | v2.2 guess | If a change moves it, suspect (in order) |
| :-- | :-- | :-- | :-- |
| Arrivals/day | **235** [215 · 256] | 239 (derived) | wave rates, elasticity |
| Utilization | **64.5%** [60.1 · 69.2] | 40–60% ⚠ | siteScore; the band was written before D21 gave archetypes real admission behaviour |
| Avg wait | **5.5 sim-min** [4.5 · 6.5] | 3–10 ✅ | peaks vs cap-bound capacity |
| Abandonment rate | **1.8%** [0.6 · 3.3] | 8–25% ❌ | **the expectation is wrong, not the sim — see below** |
| Uptime | **97.15%** [96.09 · 98.76] | 94–98 ✅ | fault model, repair means, baseline repair latency |
| Sessions completed | **178** [165 · 192] | 150–190 ✅ | downstream of everything above |
| Session success rate | **97.6%** | ≥ 90 ✅ | fault model |
| Cumulative operating margin | **£1,815** [£1,399 · £2,331] | £1,300–£1,800 ⚠ | price/energy gap, maintenance, opex |
| End cash (no upgrade) | **£51,815** — reconciles exactly | reconciliation check | invariant 6 if this doesn't reconcile |
| End trust | **56.4** [49.6 · 62.2] | 45–70 ✅ | **fixed by D30** — was 96.3 and pinned at the ceiling |
| Faults/day | **4.35** [2.0 · 6.0] | 4.4 assumed ✅ | fault model is well-formed |

**On abandonment (D31).** The 8–25% expectation predates D21, which gave each archetype its own wait sensitivity. With drivers who can see a queue and leave, a competently-run six-bay site does not generate mass abandonment — the demand goes **at the gate** instead (55 rejections/day, 23% of arrivals), and the funnel accounts for it there. Adding perceived-wait noise (D31) was the right fix for *reachability* and it did not move this number much, because the admission gate is doing the shedding by design. **Treat 8–25% as a superseded guess.** The figure to watch is the funnel split, not this rate on its own.

The p10–p90 spread on margin is £1,200 wide. **Any goal set inside that band is a coin flip** — which is what the difficulty-floor result below reflects.

**Difficulty floor check (D13): measured 80% with `minOperatingMargin` at £2,200 — PASSES.** *(70% at £2,000; 60% at £1,750; 30% before D30/D31.)* The margin goal is the one biting (met on 4/20) and `minTrust` supports it (12/20), though the two are correlated. `maxAvgWaitSeconds` and `minSessionsCompleted` remain decorative at 20/20 — see the scenario spec §5 for what that costs and the alternative that was measured. Recommended re-set from the measured distribution, per the scenario spec's own instruction to raise the margin goal first rather than touch the economy constants: `minOperatingMargin` is **£2,200** (Mark's call, OPEN-7 — closed). Set from this table's own p80 rather than from paper, which is the habit OPEN-3 established and the third time it has paid.

### 7a. Where the pre-measurement estimates came from — **read before tuning anything**

*(Retained as the derivation that the measured table above is checked against. Its arithmetic held up well: predicted 239 arrivals vs 235 measured, 28.0 kWh/session vs 28.9, 150–190 sessions vs 183. Where it was wrong — abandonment and trust — the findings note explains why, and the cause was a mechanic interaction, not the arithmetic.)*

v2.1's ranges did not follow from v2.1's own inputs: 105–150 sessions at 28 kWh each cannot produce £1,900 of margin under any combination of the stated costs (the arithmetic tops out near £1,500). The ranges above are re-derived; the derivation is here so the next person can check it rather than inherit it.

**Demand mix** (weighted across the §3 wave table, 239 arrivals/day): 107 commuter · 93 en-route · 39 panic → **mean 28.0 kWh/session, 6,703 kWh/day of demand**.

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
| `pricePerKwh` | arrivals ↓, wait ↓, margin/session ↑, trust ↘ mild |
| Arrival rate | queue ↑, abandonment ↑, utilization ↑ then plateau |
| Fault probability | uptime ↓, session success ↓, trust ↓ |
| `patienceSeconds` | abandonment ↓, avg wait ↑ |
| Maintenance → preventive | uptime ↑, margin ↓ short-term; sessions ↑ at high demand — **but see §4a: margin currently goes *up*, which is the bug, not the gradient** |
| Grid cap | throughput ↑ until bay-limited, then flat |
| Partial-charge target ↓ (D14) | kWh/session ↓, sessions/hr ↑ **at peaks**, wait ↓, trust ↘ mild; **negligible effect off-peak** (the signature that the taper is working) |
| Power policy `equal_share` → `queue_relief` (D23) | avg wait ↓, sessions/hr ↑ at peaks, kWh unchanged — it reorders service, it doesn't create power |

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
| A8 | **Realistic absolute economics; capex payback exceeds one scenario** *(rewritten under D10)* | An upgrade can never "pay for itself" inside a run; naive players may read it as always-bad | Handled by design: margin excludes capex (D12), upgrades judged operationally, dashboard shows the upgrade's throughput/wait effect — never an in-run ROI figure. Do not add a payback readout; it would always say "don't". **See scenario spec §5a — under a binding grid cap the upgrade's value is genuinely narrow, and that needs testing, not assertion** |
| A9 | **288× compression with real-magnitude constants** | UI pacing must be tuned in real seconds, separately from sim constants | Accept (per D8) |
| A10 | **Flat energy price** — no ToU/demand charges | Removes real peak-shaving dynamics; slightly flatters night charging under D8's 24h day | Deliberate MVP cut; ToU is the natural Phase 5 grid mechanic and pairs well with the 24h clock. *(Also why `reservePowerKw` was cut — D23: with no ToU there is nothing to reserve power **for**)* |
| A11 | **No weather / seasonality / cold-battery effects** | Misses classic demand spikes | Phase 5 events |
| A12 | **Abandoned drivers vanish** — no retry, no word-of-mouth beyond trust | Trust proxies crudely | Accept |
| A13 | **Maintenance tiers priced for realism, not balance** *(new — readiness review)* | `preventive` is currently cost-dominant, not a trade (§4a) | **Unresolved — OPEN-2.** The only cost-only fix breaks D10's realism commitment; the alternative (scheduled maintenance windows) is a new mechanic. Decide in Phase 3 |
| A14 | **Repairs are unlimited and instant to dispatch** *(new — readiness review)* | No technician availability, travel time or queueing; a six-bay pile-up repairs as fast as a single fault | Deliberate MVP cut (Architecture §4.4). Constraining it is the natural way to make `reliability_spiral` bite harder, and pairs with A13's scheduled-window option |

---

*Change control: §1–§5 constant edits are routine. §9 assumption changes are model changes — decision log first.*
