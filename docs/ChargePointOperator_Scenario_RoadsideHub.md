# ChargePointOperator — Scenario Spec: Roadside Hub

**Version:** 3.0 · **Date:** 2026-11-13 *(**v3.0: re-synced to the code (D56) — §2 hardware, grid, cash and upgrade as re-rated on 2026-08-17; §3 demand ×1.8; §4 contract repairs (D53); §5a re-priced. D46–D55 folded in.** · v2.4: fail rules removed by D41 — the day now always runs to 24:00)*
**Superseded header:** 2.3 · 2026-08-16 *(v2.0: rebuilt for ratified D8/D10/D14 · v2.1: bankruptcy phrasing, margin-trap observability · v2.2: readiness-review fixes — scripted-fault target pinned, §2 completed against D20, §5a upgrade-value analysis, re-derived load math · **v2.3: `minOperatingMargin` set to £2,200 from the measured distribution — D13 difficulty floor now PASSES (Mark, OPEN-7 closed)**)*
**Companions:** Calibration sheet v4.0 (constants), KPI dictionary (goal + failure-state definitions), Architecture §5.7 (`ScenarioConfig`), Decision log (D8–D26)
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
| `bays` | 6: bays 1–4 `rapid_dc` (150 kW), bays 5–6 `ultrarapid_dc` (350 kW) — *re-rated 2026-08-17; was 50 / 150 kW* | Calibration §2 |
| `initialGridPowerKw` | **650** (50% of the 1,300 kW nameplate) — *was 350* | Calibration §2 |
| `maxQueueLength` | 12 | Calibration §2 (D20) |
| `initialCash` | **£100,000** (investment float — D10); *was £50,000, which could not fund the £75k upgrade* | Calibration §4 |
| `initialPricePerKwh` | £0.79 | Calibration §4 |
| `initialConnectionFee` | **£0**, and hidden from the UI (D52); *was £0.99* | Calibration §4 |
| `referencePricePerKwh` | £0.79 (elasticity pivot — D21; **and since D43 what drivers judge your price against**) | Calibration §4 |
| **`detourMinutes`** | **`[8, 30]` sim-min to the nearest alternative rapid (D42)** | Calibration §3 |
| `energyCostPerKwh` | £0.28 | Calibration §4 |
| `opexPerSimDay` | £150 | Calibration §4 |
| `upgradeCosts` | `rapid_dc → ultrarapid_dc`: **£75,000** (150 → 350 kW); *was £40,000* | Calibration §2 (D20) |
| `initialPowerPolicy` / `initialMaintenanceLevel` | `equal_share` / `standard` | = the baseline policy (D22), so played-vs-baseline starts identical |
| `initialPartialChargeTargetSoc` | undefined (**off**) | D14 |
| `initialTrust` | 60 | Calibration §5 |
| Bays open at start | all 6 | — |

## 3. Demand waves (single source of truth)

Rates are `arrivalRatePerMinute` in sim-minutes; mixes are commuter / en-route / panic fractions. **Every rate below is multiplied by 1.8 in play** (`DEMAND_SCALE` in `roadsideHub.ts`, set with the 2026-08-17 hardware re-rating so the bigger site is still under pressure). The table keeps the base shape; the day's arrivals are ≈ 430, not 239.

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

**Load — `AMENDED (v3.0)`, measured rather than derived.** At ×1.8 the day brings ≈ **430 arrivals** wanting ≈ **32 kWh** each (D46/D47 means: commuter 24, en-route 39, panic 37.5 kWh). The 650 kW grid cap is the binding limit at the peaks: `am-commute`, `midday` and `pm-peak` arrive at 32–38 drivers an hour against an energy-bound ceiling near 20 sessions an hour.

Measured under the baseline (20 seeds, after D46–D55): **~280 drivers served**, **~31% drive on** at the entrance, average wait **3.5 min**, ~1% of those who queue give up, **~3 faults** a day including the scripted one.

**Since D48 overload shows up mostly at the entrance, not in the queue.** A commuter will join a queue of about 5 minutes and no longer, so a saturated site turns drivers away rather than building a long queue. That is why `power_choke` and `queue_collapse` now need a mistake (a price cut floods the forecourt) and are no longer reached by competent play.

**The charging limit is the one lever that raises the ceiling** (D14). Since D47 drivers want 60–100% and the last stretch above 80% charges at 40% speed, so a 90% or 75% limit cuts the slowest kWh of the session. It should help at the peaks and do almost nothing off-peak.

## 4. Faults

- **Random faults:** Calibration §5 model, scaled by maintenance level. Faults fire only on `charging` bays and integrate to ≈ `1 − reliabilityBase` per session.
- **Rate (D51):** per-session unreliability halved on 2026-11-13. Measured ~2 random faults a day under the baseline, down from ~4.3.
- **Repairs (D53):** on `standard` and `preventive` a contractor starts the repair once a fault has stood 30 / 15 min. On `reactive` a faulted bay waits until `schedule_repair` is issued (Architecture §4.4). The player can always call one out sooner at the same £200. The baseline actor calls it on the tick the fault is detected (D22).
- **Scripted fault (guaranteed):** at **12:30**, **bay 5** (`ultrarapid_dc`) throws `power_module_fault` — 350 kW of best capacity gone as the midday wave peaks. The designed "problem reveal" beat (Part I). **D54:** if the player has closed bay 5, it does not fire.

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

## 5a. Is the £75k upgrade ever the right call? — `NEW (v2.2)`, re-priced v3.0

Worth stating plainly, because the scenario's own load math cuts against it. If "when the cap binds, throughput is energy-bound *regardless of power policy*" is true — and it is — then the same logic says upgrading a bay from 150 kW to 350 kW buys **nothing at the peaks**, which is precisely when the site is in trouble. Worse, it raises nameplate from 1,300 kW to 1,500 kW against a 650 kW connection, so the cap binds *harder*. And there is no action to buy grid capacity: the constraint that actually binds cannot be purchased.

Where the upgrade does win:

- **Mid-load windows** (`mid-lull`, `pm-lull`, `evening`) where the cap is slack and a bay's own ceiling is the limit — sessions finish faster, bays free sooner, and the queue entering the next peak is shorter.
- **Cars that can use it.** Since D46 any driver's car can take 50–250 kW, so only cars above 150 kW gain from a 350 kW bay, and D50 sends them there and sends slower cars to the 150 kW bays.
- **Paired with `queue_relief`** (D23), where finishing sessions sooner is the explicit objective.

Where it loses: bought early, bought for peak relief, or bought at a site whose mix is commuter-heavy.

**This is deliberately left as a genuine trap-or-treasure and must be tested, not asserted.** Two gate criteria depend on which way it falls. If Phase 3 sweeps show "never upgrade" is simply correct, that's a dominant strategy (criterion 2) and the fix is a mechanic — buyable grid capacity is the obvious candidate, since it's the constraint the player can currently only route around. If it's *sometimes* correct, the £75k spend that buys nothing is the `margin_trap` failure state doing its job (criterion 3). Both outcomes are informative; the failure mode is not looking.

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
