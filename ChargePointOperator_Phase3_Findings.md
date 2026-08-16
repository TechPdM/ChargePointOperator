# ChargePointOperator — Phase 3 Findings (Experiment & Tuning Layer)

**Version:** 1.1 · **Date:** 2026-08-16 *(v1.1: OPEN-2 and OPEN-6 both resolved by D33 — §5 and §6 carry the outcome, and §5 records where my own recommendation was wrong)*
**Companions:** `ChargePointOperator_Plan.md` §6.4 (Phase 3 exit criteria) · `ChargePointOperator_Calibration.md` §8 (sanity gradients) · `ChargePointOperator_Decision_Log.md` (OPEN-2, OPEN-6)
**Status:** Phase 3 exit criteria met, and **both open decisions are now closed by D33** — see the resolution boxes in §5 and §6. Nothing blocks Phase 4.

---

## 1. What was built

| Deliverable | Where |
| :-- | :-- |
| Sensitivity sweep harness — parameter grids, p10/p90, **gradient scoring** | `src/game/experiment/sweep.ts` |
| Dominant-strategy test (gate criterion 2) | `src/game/experiment/strategies.ts` |
| Commuter-hub archetype | `src/game/scenarios/commuterHub.ts` |
| Destination-site archetype — exercises the third charger tier | `src/game/scenarios/destinationSite.ts` |
| Played-vs-baseline comparison, in the browser | `src/game/experiment/compareRuns.ts` |
| Post-run diagnosis summary (O5) | `src/ui/components/PostRunSummary.tsx` |
| CLI: `sweep`, `archetypes`, `strategies`, `--scenario` | `src/game/headless.ts` |

The sweep harness **scores** gradients rather than merely printing them. Calibration §8 says a flat or inverted gradient is a finding-killer; a table of plausible-looking numbers invites you to nod at it, whereas an axis that reports `FAIL` tells you when the model is lying.

### Exit criteria

| Criterion (Plan §6.4) | Result |
| :-- | :-- |
| The three operator questions answerable with logged evidence | ✅ §3 |
| Thresholds set from data rather than guesses | ✅ §2 and §4 — all three scenarios' goals now come from their own measured baseline distributions |
| Three archetypes playable | ✅ all three run headless and are selectable in the dashboard |

---

## 2. The sanity gradients: **19 of 19 behave as specified**

Six seeds per point, baseline actor, roadside hub. As first run this was 18 of 19; the one failure was the maintenance-margin expectation, which D33 both resolved and retired.

| Axis | Verdict |
| :-- | :-- |
| `pricePerKwh` | ✅✅✅ arrivals 304→205, wait 684 s→167 s, margin/session £2.13→£13.28 |
| `arrivalRate` | ✅✅✅ wait ↑, abandonment ↑, utilization up-then-flat |
| `faultProbability` | ✅✅✅ uptime 98.1→86.4%, session success 98.5→86.3%, trust 59.8→30.2 |
| `patienceSeconds` | ✅✅ abandonment 18.8%→0%, wait 299 s→697 s |
| `gridPowerKw` | ✅ throughput 2.0→4.5→8.4→9.4 sessions/hr, plateau visible at 500 kW |
| `partialChargeTarget` | ✅✅✅ kWh/session 30.4→12.6, sessions 203→330, wait 502 s→171 s |
| `powerPolicy` | ✅✅ queue_relief serves 83 vs equal_share 74 vs fast_first 72; abandonment 14.5 / 15.4 / 28.2% |
| `maintenanceLevel` | ✅ uptime ↑ · *(the margin expectation was retired by D33 — the sign is archetype-dependent by design, and a single-scenario gradient cannot express that)* |

**After D33 all 19 gradients pass.** One harness bug found and fixed along the way. Uptime rising 95.2% → 98.6% was scored "flat", because the default tolerance is 5% of the first value and uptime lives near a ceiling. That is a 70% cut in downtime and unmistakably real. Tolerance is now per-expectation. Worth noting because it is the same class of error as the `queue_collapse` one in D31: **a measurement whose noise floor is wider than the effect it is measuring will quietly report "nothing here".**

---

## 3. The three operator questions

### Q1 — Can pricing control congestion? **Yes, decisively.**

Across £0.55 → £0.89 on the corridor hub: arrivals **304 → 205**, average wait **684 s → 167 s** (a 76% cut), margin per session **£2.13 → £13.28**.

Price is the strongest single lever in the game, and it works on both sides of the ledger at once — fewer cars *and* more money per car. The catch is visible in the strategy table: pricing high wins on sites where demand is captive and loses where it is not. On the destination site, £0.63 costs only 4 drivers out of 79; on the commuter hub, the same relative rise costs 12 out of 118 and breaks the volume goal.

### Q2 — Does maintenance pay back? **Yes, but only where things actually break.** *(As first measured it paid back far too well — that was OPEN-2, now resolved by D33. The original measurement is kept below because it is what drove the fix.)*

Cumulative operating margin, 10 seeds per cell:

| | reactive | standard | preventive |
| :-- | --: | --: | --: |
| Junction 42 (corridor) | £1,057 | £1,961 | **£2,319** |
| Eastgate (commuter) | £560 | £839 | **£995** |
| Kesteven (destination) | £139 | £288 | **£380** |

Monotonic, on every archetype. **Preventive maintenance was not a trade-off; it was free money.**

**After D33** the answer differs by site, as it should: preventive gains +0.50 goals on the corridor (3.7 faults/day), +0.20 on the commuter hub (2.1), and **−0.60 on the destination site** (1.5), where it is now the third-worst strategy and loses to changing nothing.

The new detail Phase 3 adds is *why*, and it is not the uptime. On the destination site uptime moves only 99.33% → 99.64% — three tenths of a point — while margin nearly triples. The advantage is almost entirely the **per-repair cost** (£300 / £200 / £150): at ~2 faults a day, preventive pays £20/day more in standing charge to save ~£100/day in call-outs. The uptime benefit is a bonus on top.

That reframes the fix. See §5.

### Q3 — Does power policy lift peak throughput? **Yes, at peaks, and only there.**

With the grid squeezed to 150 kW and demand at ×1.6, over 6 seeds:

| Policy | Sessions | Abandonment |
| :-- | --: | --: |
| `fast_first` | 71.7 | 28.2% |
| `equal_share` | 73.8 | 15.4% |
| `queue_relief` | **82.8** | **14.5%** |

`queue_relief` is worth **+12% throughput** over `equal_share` when the cap binds, and `fast_first` is a genuine trap — it starves the marginal bays and nearly doubles abandonment for *fewer* sessions.

At the corridor hub's own 350 kW the three policies land within ~1% of each other, because the cap only binds in three windows. **On the destination site the policy is inert by construction** — 204 kW of appetite against 300 kW of supply. That is a designed inversion, not an oversight: it is what makes the archetype a real test of whether a player has understood *why* the lever works rather than that it works.

---

## 4. Gate criterion 2 — no dominant strategy: **passes, properly, after D33**

Seven standing policies × three archetypes × 10 seeds, scored by mean goals met. **After D33:**

| Strategy | Junction 42 | Eastgate | Kesteven |
| :-- | --: | --: | --: |
| as-shipped | 2.90 | 2.70 | 3.00 |
| undercut (−20% price) | 1.10 | 1.10 | 1.70 |
| **premium** (+15% price) | 2.80 | 2.80 | **3.30** |
| **preventive** | **3.40** | 2.90 | 2.40 |
| throughput (queue_relief + 70%) | 2.20 | 2.10 | 2.40 |
| **premium+preventive** | 3.30 | **3.00** | 3.30 |
| throughput+preventive | 2.50 | 1.90 | 2.40 |

**Three distinct winners, one per site** — `preventive` on the corridor, `premium+preventive` on the commuter hub, `premium` on the destination site. Buy reliability where things break; charge more where demand is captive; do both where neither dominates.

### As first measured, before D33

This is what drove the fix, and it is the more instructive table:

| Strategy | Junction 42 | Eastgate | Kesteven |
| :-- | --: | --: | --: |
| as-shipped | 2.90 | 2.70 | 3.00 |
| undercut (−20% price) | 1.10 | 1.10 | 1.70 |
| premium (+15% price) | 2.80 | 2.80 | 3.30 |
| **preventive** | **3.80** | **3.40** | 3.10 |
| throughput (queue_relief + 70%) | 2.20 | 2.10 | 2.40 |
| **premium+preventive** | 3.60 | 3.30 | **3.50** |
| throughput+preventive | 2.70 | 2.00 | 2.60 |

Two distinct winners — but **every winner contained "preventive"**, so the criterion passed on a technicality while the genuine strategic choice was one-dimensional: *how hard do you price?* That is what D33 fixed.

Three things both tables show, and which D33 did not change:

- **`undercut` is a trap on every site** (1.10–1.70 goals). Dropping price to attract customers destroys margin *and* trust, and on the corridor it is what produces `queue_collapse`. A plausible beginner mistake with a legible, punishing outcome — good.
- **`throughput` serves the most drivers everywhere and wins nowhere** (197 / 134 / 89 served, 2.1–2.4 goals). Trading kWh for turnover is a real tension between "serve the most people" and "run the best business", and the scorecard is honest that it scores the latter.
- **`premium` behaves genuinely differently by archetype** — it costs 58 drivers on the corridor, 12 on the commuter hub, and 4 on the destination site. That is O6 doing its job: the sites disagree about what good play is.

---

## 5. OPEN-2 — the decision, with the evidence now in

Preventive maintenance wins on all three archetypes. The break-even standing charge is **~£460/day** on the corridor (£182k/year on six bays), which is the number D10's realism commitment refuses.

Phase 3 adds one thing that changes the recommendation's shape: **the dominance is mostly a repair-pricing effect, not an uptime effect.** On a quiet site the uptime gain is three tenths of a point and preventive still nearly triples margin, purely because call-outs are cheaper.

**Three options, in the order I would rank them:**

1. **Scheduled maintenance windows (a new mechanic).** Preventive takes a bay out of service for a planned window each day. It is realistic, it costs the resource the game is actually about — bay-time — and it bites *hardest on quiet sites*, which is precisely where preventive is currently most overpowered. It also pairs with A14 (repairs are currently unlimited and instant to dispatch), so one mechanic fixes two soft spots. Cost: real work — new state, a scheduling decision, UI surface.
2. **Flatten the per-repair cost across tiers** (say £200 for all three) and let the tiers differ only on fault *rate* and repair *speed*. This kills the dominance at its actual source, costs nothing to implement, and keeps the standing charges realistic. It weakens the flavour — "a maintenance contract gets you cheaper call-outs" is true to life — but it is a one-line change and the measurement says it is aimed at the right thing.
3. **Reprice the standing charge to ~£460/day.** Kills the dominance, breaks D10. Not recommended.

**Option 2 is the cheap experiment and option 1 is the good mechanic.** They are not exclusive: 2 can land now and be superseded by 1 in Phase 5.

> **RESOLVED — D33, option 2, and the recommendation above was half wrong.**
>
> Flattening the call-out cost alone did *not* kill the dominance — it cut preventive's advantage on the corridor from £414/day to £233/day and eliminated it on the destination site, but preventive still topped every archetype. My §5 reasoning attributed the dominance to the repair-price ladder; the ladder was only part of it. The bigger term is simply that **halving the fault rate saves 1.2 faults/day × £200 = £240/day for a £20/day standing charge.**
>
> What flattening *did* do was make the second half affordable. The break-even standing charge fell from ~£460/day — which genuinely did break D10, as this note claimed — to **£150/day, which is £9.1k per bay per year and an entirely normal comprehensive O&M contract.** So the fix is option 2 plus a standing charge that was arguably under-priced all along.
>
> **Measured after both changes:** preventive gains +0.50 goals on the corridor, +0.20 on the commuter hub, and **−0.60 on the destination site**, where it now loses to changing nothing. The dominant-strategy test went from two winners *both containing preventive* to three distinct winners: `preventive`, `premium+preventive`, `premium`. The lesson for the next time: an option set can be wrong in a way that makes a correct calculation point at the wrong conclusion.

---

## 6. OPEN-6 — the partial-charge option list

The sweep quantifies what Phase 1 diagnosed. Charging-limit values against a ×1.6 demand load:

| Limit | kWh/session | Sessions | Avg wait |
| :-- | --: | --: | --: |
| off | 30.4 | 203 | 502 s |
| 70% | 24.9 | 215 | 392 s |
| 60% | 19.5 | 265 | 317 s |
| 50% | 12.6 | 330 | 171 s |

The mechanic is powerful and well-behaved across its whole range — but the range that *does anything* starts below 0.80, because every driver already targets 0.80 or less. The shipped options (off / 0.90 / 0.80 / 0.70) waste three of their four slots.

**Two ways to fix it:**

- **Re-scope the options to off / 0.70 / 0.60 / 0.50.** One-line change; all four then do something. Loses the "gentle cap" setting.
- **Give driver target SOC real spread** (say 0.70–0.95 rather than a flat 0.80). More faithful — real drivers do not all want the same charge — and it makes 0.90 and 0.80 bite on the drivers who wanted more. Costs a calibration change and a re-measure of everything downstream of session length.

The second is better design; the first is available today.

> **RESOLVED — D33: re-scoped to off / 0.70 / 0.60 / 0.50.** All four settings now do something. Giving driver target SOC real spread remains the better model and is parked for Phase 5, where it would restore a meaningful "gentle cap" option.

---

## 7. What Phase 4 needs before it starts

Nothing blocking. The playtest protocol is frozen and unchanged, the three archetypes are playable, and the post-run summary answers the protocol's third question (*did it work? how do you know?*) directly, including the played-vs-baseline comparison a tester needs to distinguish a good decision from a kind seed.

Two things worth doing first if there is appetite: **decide OPEN-2** (playtesters will otherwise all discover the same free lunch and the strategy probe will return one answer), and **decide OPEN-6** (three dead settings on a live control is exactly the kind of thing the observation sheet counts as a legibility bug).
