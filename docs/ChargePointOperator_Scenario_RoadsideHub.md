# ChargePointOperator — Scenario Spec: Roadside Hub

**Version:** 2.4 · **Date:** 2026-08-19 *(v2.4: fail rules removed by D41 — the day now always runs to 24:00)*
**Superseded header:** 2.3 · 2026-08-16 *(v2.0: rebuilt for ratified D8/D10/D14 · v2.1: bankruptcy phrasing, margin-trap observability · v2.2: readiness-review fixes — scripted-fault target pinned, §2 completed against D20, §5a upgrade-value analysis, re-derived load math · **v2.3: `minOperatingMargin` set to £2,200 from the measured distribution — D13 difficulty floor now PASSES (Mark, OPEN-7 closed)**)*
**Companions:** Calibration sheet v2.2 (constants), KPI dictionary (goal + failure-state definitions), Architecture §5.7 (`ScenarioConfig`), Decision log (D8–D26)
**This is the MVP scenario (Plan D5)** — `scenarios/roadsideHub.ts` in prose form. Commuter-hub and destination-site variants follow in Phase 3 (O6).

---

## 1. Identity & fantasy

| Field | Value |
| :-- | :-- |
| `id` | `roadside-hub-01` |
| `archetype` | `corridor_hub` |
| `name` | "Junction 42 Services" |
| Fantasy | A high-traffic A-road services hub across one full day — from the 2am panic arrival with 4% battery, through the commuter crush, to the evening peak that stress-tests everything you fixed at lunchtime. Keep it flowing. |

## 2. Configuration

Field names below are the `ScenarioConfig` fields from Architecture §5.7. **v2.2:** several of these had no field to live in until D20 completed the type — the site hardware, initial trust, connection fee, initial policies, upgrade prices, queue capacity and fail rules were all prose here and unrepresentable in code.

| Field | Value | Source |
| :-- | :-- | :-- |
| `durationSeconds` | 86,400 (00:00–24:00 at 288× = 300 real seconds) | Calibration §1 (D8) |
| `tickSeconds` | 60 | Calibration §1 (D26) |
| `bays` | 6: bays 1–4 `rapid_dc` (50 kW), bays 5–6 `ultrarapid_dc` (150 kW) | Calibration §2 |
| `initialGridPowerKw` | 350 | Calibration §2 |
| `maxQueueLength` | 12 | Calibration §2 (D20) |
| `initialCash` | £50,000 (investment float — D10) | Calibration §4 |
| `initialPricePerKwh` | £0.79 | Calibration §4 |
| `initialConnectionFee` | £0.99 | Calibration §4 |
| `referencePricePerKwh` | £0.79 (elasticity pivot — D21; **and since D43 what drivers judge your price against**) | Calibration §4 |
| **`detourMinutes`** | **`[8, 30]` sim-min to the nearest alternative rapid (D42)** | Calibration §3 |
| `energyCostPerKwh` | £0.28 | Calibration §4 |
| `opexPerSimDay` | £150 | Calibration §4 |
| `upgradeCosts` | `rapid_dc → ultrarapid_dc`: £40,000 | Calibration §2 (D20) |
| `initialPowerPolicy` / `initialMaintenanceLevel` | `equal_share` / `standard` | = the baseline policy (D22), so played-vs-baseline starts identical |
| `initialPartialChargeTargetSoc` | undefined (**off**) | D14 |
| `initialTrust` | 60 | Calibration §5 |
| Bays open at start | all 6 | — |

## 3. Demand waves (single source of truth)

Rates are `arrivalRatePerMinute` in sim-minutes; mixes are commuter / en-route / panic fractions.

| Sim clock | Wave | Rate /min | Mix c/e/p | `priceElasticity` | Character |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 00:00–05:00 | `night` | 0.04 | .10/.40/.50 | 0.7 | Sparse, panic-heavy — the 2am 4%-battery arrivals (D8) |
| 05:00–07:00 | `early` | 0.10 | .60/.30/.10 | 1.0 | First commuters trickle in |
| 07:00–09:30 | `am-commute` | 0.30 | .80/.10/.10 | 1.2 | First stress: price-sensitive commuters |
| 09:30–11:30 | `mid-lull` | 0.15 | .40/.50/.10 | 1.0 | Recovery window |
| 11:30–14:00 | `midday` | 0.30 | .25/.60/.15 | 0.9 | En-route surge; **scripted fault lands here** |
| 14:00–16:30 | `pm-lull` | 0.18 | .40/.45/.15 | 1.0 | Repair/upgrade window |
| 16:30–19:00 | `pm-peak` | 0.35 | .50/.35/.15 | 0.8 | The big one — least elastic, most impatient |
| 19:00–22:00 | `evening` | 0.12 | .30/.50/.20 | 1.0 | Wind-down |
| 22:00–24:00 | `late` | 0.05 | .10/.50/.40 | 0.8 | Stragglers and one last panic case |

**Load math — `AMENDED (v2.2)`:** ≈ 239 arrivals/day carrying **6,703 kWh** of demand, at a mix-weighted **28.0 kWh/session** (full derivation: Calibration §7a — v2.1's round "30 kWh" was close but the ceiling figures downstream of it were not).

Service capacity has two regimes: **unconstrained** ≈ 15 sessions/hour (bay-limited, at the ~72 kW mean effective power the vehicle caps of D15 actually allow), but **when the 350 kW grid cap binds** — by design, at peaks — throughput is energy-bound at ≈ 350 ÷ 28 ≈ **12.5 sessions/hour** regardless of power policy (policies redistribute the pain; they don't create kilowatts). `am-commute` ≈ 18/hr and `pm-peak` ≈ 21/hr against that ceiling build real backlogs.

Whole-day energy is *not* the constraint — 350 kW over 24h is 8,400 kWh against 6,703 kWh of demand. The constraint is temporal, and it bites in exactly three windows (Calibration §7a): `am-commute` (absorbed by the mid-lull), `midday` (~465 kWh lost, worsened by the scripted fault) and `pm-peak` (~156 kWh lost). That is the shape of the game.

**Partial-charge (D14) is the one lever that raises the ceiling** — capping at 0.80 SOC cuts kWh/session and dodges the slow taper zone entirely (Calibration §3), so it should visibly transform peak throughput and do almost nothing off-peak. Admission rejections + abandonment shed the rest; expected served ≈ **150–190** (Calibration §7 — corrected from v2.1's 105–150, which did not follow from these inputs). If peaks prove unwinnable or trivial, tune the two peak rates first.

## 4. Faults

- **Random faults:** Calibration §5 model, scaled by maintenance level. Faults fire only on `charging` bays and integrate to ≈ `1 − reliabilityBase` per session.
- **Repairs:** never automatic — a faulted bay waits until `schedule_repair` is issued (Architecture §4.4). The baseline actor calls it on the tick the fault is detected (D22).
- **Scripted fault (guaranteed):** at **12:30**, **bay 5** (`ultrarapid_dc`) throws `power_module_fault` — 150 kW of best capacity gone as the midday wave peaks. The designed "problem reveal" beat (Part I).

  *v2.2 fix:* v2.1 said "the busier ultra bay; tiebreak bay 5" and then called the fault seed-independent. It wasn't — which bay is busier varies by seed. The **timing** is what has to be seed-independent, because it's a story beat; the target is now a fixed `bayId` in `scenario.scriptedFaults` (D20). Bay 5 over bay 6 is arbitrary and that's fine.

## 5. Goals & failure conditions

Goal values are first guesses (C9) — CUM definitions per the KPI dictionary. **v2.0 change (D10):** the cash-floor goal is replaced by an operating-margin goal; with a £50k float, "end richer than you started" measured nothing.

**Win (all three at end of run)** — *three, not four, since **D44** removed `minSessionsCompleted`. Values re-fitted for the D42/D43 demand model; the figures below supersede the £2,200 / 480 s / 110 set this section carried through D36.*

| Goal | Value |
| :-- | :-- |
| `minOperatingMargin` | ≥ **£3,200** CUM (revenue − energy − maintenance − opex; capex excluded per D12) — *from the measured 20-seed baseline spread £3,169–£4,445, p50 £3,453. Raised from £2,800 because site-aware pricing let the corridor earn more for the same traffic and the old goal had gone free at 20/20* |
| `maxAvgWaitSeconds` | ≤ **420** (7 sim-min, CUM) |
| `minTrust` | ≥ **55** — *unchanged through four re-fits, and still the goal that bites (met on 4/20)* |

**`minSessionsCompleted` is gone (D44).** Driver count is not a measure an operator manages to. `sessionsCompleted` is still reported on the dashboard — without a tone, because a colour there would be the scorecard claiming that serving more people is better.

**Fail (immediately, any)** — **none. Removed by D41 (2026-08-19).** The day ends at 24:00 and nowhere else; there is no game-over. The two rules that used to live here were `bankruptcyCashBelow: 0` and `trustBelow: 30` sustained for 2 sim-hours. The first never fired — D37 refuses unaffordable upgrades, so nothing can spend past zero. The second fired on reputation, around 20:00, on a site the player had been losing since 18:00. Both are now outcomes scored at close-out rather than reasons to stop. **Margin-trap observability note (v2.1, still true and now the general case):** the *margin trap* failure state manifests as capex producing no goal improvement — visible in the played-vs-baseline comparison and the post-run summary, never as a game-over screen. D24 makes that detectable rather than merely narratable, and since D41 that is how every failure presents.

**Design intent:** the goals still pull against each other — but **how** price pulls is now this site's own business (D42/D43), and that is the point of the change. Partial-charge helps wait but trims kWh; preventive maintenance helps trust and uptime but *should* eat margin (**Calibration §4a, OPEN-2 — still not fully resolved**). The £75k upgrade is deliberately *not* goal-scored: it's a bet that better hardware makes the other goals reachable, judged operationally (A8).

**This site has real pricing power, and that is a fact about its geography.** The nearest alternative rapid is 8–30 sim-minutes away depending on which way you are heading, so a driver here will pay a premium rather than detour — and the local going rate is £0.79, which is what they measure your price against. Measured over 20 seeds, **margin peaks at £0.90**, and putting the list price up 15% is worth **+£197**.

**That answer does not transfer.** The same measurement puts the optimum at £0.75 at Eastgate, where the chargers on the next street mean a 15% rise *loses* £364 a day, and at £0.70 at Kesteven. Before D42/D43 all three sites peaked at £0.85 and "put the price up" was correct everywhere on day one — pricing was a lookup, not a decision.

**Failure states** are defined in the KPI dictionary (D24) and detected every tick. They don't end the run; they're recorded so gate criterion 3 is a count rather than an opinion.

**Difficulty floor (D13, ratified): measured 80% — PASSES, with no headroom.** The passive baseline fails ≥1 goal on 16 of 20 seeds. **`minTrust` is the goal doing the work** (met on 4/20); margin (17/20) and wait (14/20) are achievable but no longer free.

**The correlation this section used to rely on has inverted.** It once read that every seed missing on trust also missed on margin, because a broken charger costs both takings and reputation. That stopped being true at D36: the busier site earns money while spending goodwill, so trust and margin now fail independently. The floor rests on `minTrust` alone, and that single unchanged number has survived four re-fits.

**Known consequence, still worth watching:** with three goals there is one fewer way for a day to go wrong, so the survivors carry more. That is why Eastgate's wait goal had to tighten when D44 landed — its floor fell to 75% on the goal removal alone.

Standing instruction unchanged: raise a goal, never the economy constants, for difficulty reasons.

## 5a. Is the £40k upgrade ever the right call? — `NEW (v2.2)`

Worth stating plainly, because the scenario's own load math cuts against it. If "when the cap binds, throughput is energy-bound *regardless of power policy*" is true — and it is — then the same logic says upgrading a bay from 50 kW to 150 kW buys **nothing at the peaks**, which is precisely when the site is in trouble. Worse, it raises full simultaneous demand from 500 kW to 600 kW, so the cap binds *harder*. And there is no action to buy grid capacity: the constraint that actually binds cannot be purchased.

Where the upgrade does win:

- **Mid-load windows** (`mid-lull`, `pm-lull`, `evening`) where the cap is slack and a bay's own ceiling is the limit — sessions finish faster, bays free sooner, and the queue entering the next peak is shorter.
- **En-route drivers**, who carry the largest energy demand (35.8 kWh) and the highest `maxChargeRateKw` (120–250) — they're the only archetype that can actually use 150 kW. A commuter capped at 90 kW wastes a third of an ultra bay.
- **Paired with `queue_relief`** (D23), where finishing sessions sooner is the explicit objective.

Where it loses: bought early, bought for peak relief, or bought at a site whose mix is commuter-heavy.

**This is deliberately left as a genuine trap-or-treasure and must be tested, not asserted.** Two gate criteria depend on which way it falls. If Phase 3 sweeps show "never upgrade" is simply correct, that's a dominant strategy (criterion 2) and the fix is a mechanic — buyable grid capacity is the obvious candidate, since it's the constraint the player can currently only route around. If it's *sometimes* correct, the £40k spend that buys nothing is the `margin_trap` failure state doing its job (criterion 3). Both outcomes are informative; the failure mode is not looking.

## 6. The five real-time minutes (player experience arc)

Each real minute = 4.8 sim-hours (D8):

| Real min | Sim clock | Intended beat |
| :-- | :-- | :-- |
| 1 | 00:00–04:48 | Night quiet — learn the board with live but sparse traffic; panic arrivals keep it from being empty |
| 2 | 04:48–09:36 | `am-commute` builds and crests; first real queue |
| 3 | 09:36–14:24 | **Crisis:** scripted ultra fault at 12:30 under the midday wave — repair now or ride it out? |
| 4 | 14:24–19:12 | Brief lull to spend (repair? upgrade? policy change?), then `pm-peak` stress-tests it |
| 5 | 19:12–24:00 | Wind-down, late panic cases, score |

Scenario-design self-test: after one run the player should be able to narrate those five beats back. Undifferentiated noise = wave contrast needs work. (D8 watch-item: if minute 1 plays as dead air rather than calm-with-texture, consider variable compression of 00:00–05:00 before redesigning anything.)

## 7. Variants & seeds

- **Baseline runs:** fixed policy per §2 **and D22** (which pins the two things §2 can't express: `standard` maintenance, and `schedule_repair` on the tick a fault is detected — that second one swings baseline uptime between ~92% and ~98%, and it's what D13's floor is checked against). Seed batch ≥20, refreshed whenever Calibration constants change; difficulty-floor check (D13) runs on the same batch, reporting mean **and** p10/p90.
- **Playtest seeds:** `pt-1`, `pt-2`, `pt-3` fixed for all Phase 4 testers (protocol §1). Seeds are **strings** throughout (D26) — the manifest and log schemas typed them `number`, which these literally are not.
- **Phase 3 siblings:** `commuter-hub-01` (two sharp peaks, dead midday, low panic) and `destination-site-01` (long-dwell, low urgency, `slow_ac`-heavy — exercises the third tier). Specced in Phase 3; the roadside hub is not "the game".
