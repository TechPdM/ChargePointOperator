# ChargePointOperator — Gate Scorecard

**Version:** 2.3 (partial) · **Date:** 2026-11-15 *(**v2.3: re-measured at 40 seeds after D65–D67 (fixed days, trust, goals re-fitted). Criterion 2 now passes clearly: `wave-pricing` is ruled out at every site. New: the D67 winnability check, the other side of D13, passes at all three sites.** · **v2.2: criterion 2 PASSES narrowly under D62 — `wave-pricing` is credible everywhere but the best nowhere, so it is reported as an all-rounder. v2.1 recorded it as a FAIL on the strict reading (D61); D62 amended the rule after that result, and says so. Criteria 3 and 4 pass. v2.0 (earlier the same day) had criterion 2 passing narrowly. The self-playtest below predates the revision.** · v1.1: criterion 2's prose corrected for D38. **v1.2: criterion 2 re-issued at 40 seeds against the D42–D45 model with three goals — the deferred re-run is done. Two measured fragilities recorded with it: the verdict flips on a single £50 goal threshold, and `preventive` sits close to the bar at two of three sites.**)*
**Criteria:** `ChargePointOperator_Plan.md` §6.2 · **Thresholds:** `ChargePointOperator_Playtest_Protocol.md` §5
**Status:** **3 of 5 criteria scored, plus the D67 winnability check. The verdict is not yet available** — criteria 1 and 5 require the external tester sessions, and nothing in this repository can substitute for them.

---

## Why two rows are blank

The protocol was frozen before a line of code existed, precisely so the gate could not be quietly rigged later. Two criteria are irreducibly human:

- **Criterion 1 (legibility)** is scored by asking three frozen questions of someone who did not build this, and checking their answers against the logs. A confident wrong answer scores ✗ *and* counts as a legibility bug. There is no machine version of that.
- **Criterion 5 (one-more-run)** is whether a tester *volunteers* a third go when told the session is over. The volunteering is the measurement.

Filling those rows from self-play or from a model's judgement would produce a number, and the number would be worthless. They stay blank until three people have sat down with it.

---

## Scorecard

| # | Criterion | Threshold | Evidence | Verdict |
| :-- | :-- | :-- | :-- | :-- |
| 1 | **Legibility** | ≥2 of 3 external testers score ≥5/6 ✓ across runs 1–2, within ~30 s each | §3 question scores | **PENDING — needs testers** |
| 2 | **No dominant strategy** | Sweeps show ≥2 policy families winning on different archetypes; testers propose ≥2 credible strategies | `strategies` over 3 archetypes × 8 policies, **40 seeds, re-issued 2026-11-15 for D65–D67** | **PASS** (machine half) · three winners, nothing credible everywhere · tester probe pending |
| 3 | **Failure modes reachable** | ≥4 of 5 failure states observed arising naturally | 36 runs, `RunManifest.failure_states_observed` | **PASS — 5 of 5** |
| 4 | **Decisions matter** | Median played run differs meaningfully from baseline on ≥2 goal KPIs; the three operator questions answerable from logs | `compareRuns` on playtest seeds; Phase 3 findings §3 | **PASS** |
| 5 | **One-more-run** | ≥2 of 3 external testers voluntarily take run 3 | Run-3 uptake | **PENDING — needs testers** |
| D67 | **Winnable** *(not a Plan §6.2 criterion; the other side of D13)* | A scripted good player wins ≥55% of days (≥75% at Trevithick); the baseline ≤20% | `winnable`, 40 days a site, stored good-player settings | **PASS** — 68% / 73% / 85%; baseline 0% / 8% / 5% |

---

## Criterion 2 — no dominant strategy · **PASS (machine half)** · *re-issued 2026-11-15, D65–D67*

Eight policies × three archetypes × **40 seeds**, against the D65–D67 model and goals. Mean goals met out of 3 (win rate in brackets):

| Strategy | Junction 42 | Eastgate | Trevithick |
| :-- | --: | --: | --: |
| as-shipped | 1.35 (0%) | 1.63 (18%) | 1.52 (8%) |
| undercut | 0.93 (0%) | 0.00 (0%) | 0.42 (0%) |
| premium | 2.17 (18%) | 1.32 (0%) | **2.55 (65%)** |
| preventive | 1.32 (0%) | **1.82 (25%)** | 1.45 (0%) |
| throughput | 2.02 (3%) | 1.18 (0%) | 1.35 (8%) |
| premium+preventive | **2.35 (35%)** | 1.18 (0%) | 2.50 (50%) |
| throughput+preventive | 2.02 (3%) | 1.10 (0%) | 1.43 (0%) |
| wave-pricing *(D55)* | 2.10 (10%) | 1.50 (5%) | 2.40 (50%) |

| Site | Winner | Not measurably behind it |
| :-- | :-- | :-- |
| Junction 42 | `premium+preventive` | nothing — clear of the field |
| Eastgate | `preventive` | `as-shipped` (*t*=1.48) |
| Trevithick | `premium` | `premium+preventive` (*t*=0.44) |

**Verdict: PASS, and no longer narrow.** Three distinct winners, and no strategy is credible at more than one site. `wave-pricing`, which D61/D62 turned on, is now ruled out everywhere: D66's trust change and D67's goals no longer reward its thin margin over the field. D62's all-rounder reading is not needed for this result.

**These are fixed strategies; a good player beats all of them.** The best fixed strategy wins 35% / 25% / 65%; the D67 good player, which adjusts price to the queue and chooses its settings per site, wins 68% / 73% / 85% on its own days. Playing the day still pays.

**Still outstanding:** the tester half — whether people propose ≥2 credible strategies.

*Previous issues:* 2026-11-13, D46–D60: PASS narrowly under D62 (`wave-pricing` credible everywhere, best nowhere; FAIL on D61's strict reading). Earlier that day, D46–D58: PASS narrowly. v1.2 (D42–D45): PASS, winners `premium+preventive` / `preventive` / `premium+preventive`.

## Criterion 3 — failure modes reachable · **PASS, 5 of 5**

36 runs: 3 scenarios × 3 playtest seeds × 4 approaches a real player would plausibly take (played straight, ignores the faults, cuts the price to attract customers, buys the upgrade early).

| Failure state | Runs observed in *(2026-11-15, D65–D67)* | *2026-11-13 (D46–D63)* | *v1.2* |
| :-- | --: | --: | --: |
| `reliability_spiral` | 24 | 25 | 16 |
| `power_choke` | 6 | 6 | 17 |
| `margin_trap` | 8 | 5 | 4 |
| `queue_collapse` | 4 | 4 | 4 |
| `trust_crash` | **11** | 4 | 6 |

All five, against a threshold of four — and none of them from a contrived setup. `queue_collapse` and `trust_crash` both come from the "cut the price to attract customers" run, which is the most plausible beginner mistake in the game and is punished legibly. `margin_trap` comes from buying the £75k upgrade early, which is the trap Scenario spec §5a deliberately left in.

*(These were unreachable as recently as Phase 1. D30 and D31 fixed that; this row is what those decisions bought.)*

**D66 nearly tripled `trust_crash`, and that is intended.** A broken bay left open now drains trust until it is repaired or closed, so the "ignores the faults" approach crashes trust as Mark asked. The playtest seeds are different days since D65, so the other small moves are the days, not the model.

**After D46–D63 most counts are lower, and that is intended.** Faults are halved (D51) and drivers no longer join long queues (D48), so `power_choke` and `queue_collapse` now need a mistake rather than a busy day; D58 re-derived `queue_collapse` by D31's method. `reliability_spiral` is the exception, up to 25: since D63 the site starts with no contract, so the "ignores the faults" approach really does leave every fault unrepaired.

## Criterion 4 — decisions matter · **PASS**

Played (`premium + preventive`) against the passive baseline, same seeds, on the corridor hub *(re-measured 2026-11-15, D65–D67)*:

| Seed | Margin | Served | Trust | Goals met |
| :-- | --: | --: | --: | --: |
| pt-1 | +£861 | −30 | +5.3 | 0 |
| pt-2 | +£535 | −34 | +1.3 | **+1** |
| pt-3 | **+£1,061** | −31 | **+7.1** | **+2** |

Seven KPIs move ≥10% against baseline across the playtest seeds: sessions completed, average wait, abandonment rate, kWh delivered, margin, trust, goals met.

The row worth reading twice is pt-1: £861 more margin and still no extra goal, because Junction 42's margin goal is now £4,550. **The strategy is not a cheat code**, which is the healthy version of this criterion. *(2026-11-13: pt-1 +1, pt-2 +3, pt-3 −1 goals; the seeds are different days since D65.)*

**The three operator questions are answerable from logs** (Phase 3 findings §3): pricing cuts average wait 76% across a 34p range; power policy was worth +12% throughput when the cap binds (since D48 the gain shows as fewer queue abandonments instead, because overload now leaves at the entrance); maintenance pays back on a busy site and loses money on a quiet one.

## D67 — winnable · **PASS**

The other side of D13. D13 checks that doing nothing usually loses; this checks that good play usually wins. A scripted good player (`experiment/goodPlayer.ts`) uses only what the dashboard shows. Its settings per site were found by search (`bench`) and are stored in `WINNABILITY` (`experiment/benchmark.ts`); `winnable` replays them on 40 days of their own (`g1`–`g40`).

| Site | Good player | Needs | Baseline | Needs | Good player's settings |
| :-- | --: | --: | --: | --: | :-- |
| Junction 42 | **68%** | ≥55% (fitted 60–70%) | 0% | ≤20% | preventive, price ×1.10, +20% while the forecast wait is over 5 min, 90% limit then, finish soonest first |
| Eastgate | **73%** | ≥55% (fitted 60–70%) | 8% | ≤20% | preventive, price ×1.10, finish soonest first |
| Trevithick | **85%** | ≥75% (fitted 80–90%) | 5% | ≤20% | no contract, price ×1.25 |

Over 80 days that no fit used, the good player won 63% at Junction 42 and 66% at Eastgate. Each 40-day figure carries about ±8 points of sampling noise. The search changes one setting at a time, so these are a floor on good play, not a ceiling.

---

## Self-playtest, `pt-1`, corridor hub

Counts for criterion 3 evidence; **excluded from criterion 1 scoring** — the builder cannot score their own legibility (protocol §1).

Two decisions taken: preventive maintenance at 05:45, price £0.79 → £0.88. The 12:30 scripted fault on bay 5 was noticed 47 sim-minutes late and repaired.

| | Result |
| :-- | :-- |
| Outcome | **All four goals met** |
| Margin | £2,294 (goal £2,200) |
| Average wait | 3.6 min (goal 8.0) |
| Trust | 72.5 (goal 55) |
| Served | 159 (goal 110) |
| vs doing nothing | **+£305 margin, +9.4 trust, −2.3 min wait, −3 drivers served** — baseline met 3 of 4 |

Two decisions turned a 3/4 baseline into a 4/4 win, and the post-run summary attributes it. That is the shape criterion 4 wants, experienced rather than computed.

**Observations for the observation sheet:** the fault sat 47 sim-minutes before it was acted on, even with the alert visible — worth watching whether testers spot it faster at 1×, since the protocol asks specifically about reaction to the 12:30 beat.

---

## What is needed to finish the gate

1. **Three external testers**, at least one who is neither a gamer nor an EV person (protocol §1, OPEN-1). If only two can be found, the documented fallback is "both must pass".
2. **~30 minutes each**, following the protocol: run 1 free play on `pt-1`, the three frozen questions, run 2 on `pt-2` to improve, questions again plus the strategy probe, then run 3 *offered and not assigned*.
3. **Save each run** — the "Save run" button writes a manifest plus NDJSON, labelled `tester-run` automatically on the playtest seeds.
4. Fill rows 1 and 5, then the verdict: **all five pass → go** · fails on 1/3/4 → **tune** · fails on 2 or 5 → **pivot** to Operations Balancer. Partial credit is not a verdict; the worst-failing criterion decides.
5. **The findings note** (protocol §6, 1–2 pages) is the actual deliverable of the whole MVP.

The apparatus is ready. What is missing is people.
