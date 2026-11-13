# ChargePointOperator — Gate Scorecard

**Version:** 2.2 (partial) · **Date:** 2026-11-13 *(**v2.2: criterion 2 PASSES narrowly under D62 — `wave-pricing` is credible everywhere but the best nowhere, so it is reported as an all-rounder. v2.1 recorded it as a FAIL on the strict reading (D61); D62 amended the rule after that result, and says so. Criteria 3 and 4 pass. v2.0 (earlier the same day) had criterion 2 passing narrowly. The self-playtest below predates the revision.** · v1.1: criterion 2's prose corrected for D38. **v1.2: criterion 2 re-issued at 40 seeds against the D42–D45 model with three goals — the deferred re-run is done. Two measured fragilities recorded with it: the verdict flips on a single £50 goal threshold, and `preventive` sits close to the bar at two of three sites.**)*
**Criteria:** `ChargePointOperator_Plan.md` §6.2 · **Thresholds:** `ChargePointOperator_Playtest_Protocol.md` §5
**Status:** **3 of 5 criteria scored. The verdict is not yet available** — criteria 1 and 5 require the external tester sessions, and nothing in this repository can substitute for them.

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
| 2 | **No dominant strategy** | Sweeps show ≥2 policy families winning on different archetypes; testers propose ≥2 credible strategies | `strategies` over 3 archetypes × 8 policies, **40 seeds (80 where borderline), re-issued 2026-11-13 for D46–D60** | **PASS, narrowly** (machine half, under D62) · adaptive `wave-pricing` is an all-rounder, best nowhere · tester probe pending |
| 3 | **Failure modes reachable** | ≥4 of 5 failure states observed arising naturally | 36 runs, `RunManifest.failure_states_observed` | **PASS — 5 of 5** |
| 4 | **Decisions matter** | Median played run differs meaningfully from baseline on ≥2 goal KPIs; the three operator questions answerable from logs | `compareRuns` on playtest seeds; Phase 3 findings §3 | **PASS** |
| 5 | **One-more-run** | ≥2 of 3 external testers voluntarily take run 3 | Run-3 uptake | **PENDING — needs testers** |

---

## Criterion 2 — no dominant strategy · **PASS (machine half), narrowly** · *re-issued 2026-11-13, D61 then D62*

Eight policies × three archetypes × **40 seeds**, re-run at **80 seeds** for the top contenders at Junction 42 and Kesteven. Measured against the D46–D60 model and the goals as of D59. Mean goals met out of 3:

| Strategy | Junction 42 | Eastgate | Kesteven |
| :-- | --: | --: | --: |
| as-shipped | 1.13 | 1.32 | 1.32 |
| undercut | 0.00 | 0.00 | 0.00 |
| premium | 1.84 | 1.00 | **2.40** |
| preventive | 1.66 | **1.40** | 0.95 |
| throughput | 1.18 | 1.00 | 1.30 |
| premium+preventive | **2.35** | 1.00 | 2.35 |
| throughput+preventive | 1.35 | 1.00 | 1.18 |
| **wave-pricing** *(D55)* | 2.20 | 1.35 | 2.25 |

*(80 seeds for premium, preventive, premium+preventive and wave-pricing at Junction 42, and premium, premium+preventive and wave-pricing at Kesteven; 40 otherwise.)*

| Site | Winner | Not measurably behind it |
| :-- | :-- | :-- |
| Junction 42 | `premium+preventive` | **`wave-pricing`** (0.15 behind, *t*=1.35) |
| Eastgate | `preventive` | **`wave-pricing`** (*t*=0.39), `as-shipped` (*t*=0.72) |
| Kesteven | `premium` | `premium+preventive` (*t*=0.48), **`wave-pricing`** (0.15 behind, *t*=1.84) |

**Verdict under D62: PASS.** Three distinct winners, and no strategy is both the best somewhere and credible everywhere.

**`wave-pricing` is an all-rounder, not a dominant strategy.** It cannot be ruled out at any site, but it is the best at none: it trails a different, site-specific winner everywhere. Under D38 as first written that counted as dominant, and D61 recorded it as a **FAIL**. D62 then amended the rule — dominant now also requires being the top scorer somewhere, matching the protocol's "no single policy *wins* everywhere" — and **that amendment was made after seeing the fail**. Both steps are in the decision log so the record shows how this verdict was reached. The rule itself: 15% over list in waves well above the day's mean rate, 10% under in the quiet ones, list otherwise; a player has to make about 8 changes by hand in a 5-minute day.

**Fixed setups alone also pass** — none is credible everywhere.

**Why "narrowly".** `wave-pricing` is within 0.15 goals of the best at every site, and the gaps shrank as seeds were added. A small model change could make it the top scorer somewhere, at which point it would be dominant under D62 too. This verdict has already moved twice on the same day (pass before D59, fail under D61, pass under D62), the same fragility v1.2 recorded.

**Still outstanding:** the tester half — whether people propose ≥2 credible strategies, and whether they find the wave-pricing rule. That is the real test of whether it is a skill or a solved puzzle.

*Previous issues:* 2026-11-13 morning, D46–D58 with the pre-D59 baseline: PASS narrowly, `wave-pricing` ruled out only at Kesteven (*t*=2.11). v1.2 (D42–D45, seven standing policies): PASS, winners `premium+preventive` / `preventive` / `premium+preventive`.

## Criterion 3 — failure modes reachable · **PASS, 5 of 5**

36 runs: 3 scenarios × 3 playtest seeds × 4 approaches a real player would plausibly take (played straight, ignores the faults, cuts the price to attract customers, buys the upgrade early).

| Failure state | Runs observed in *(2026-11-13, D46–D63)* | *v1.2* |
| :-- | --: | --: |
| `reliability_spiral` | 25 | 16 |
| `power_choke` | 6 | 17 |
| `margin_trap` | 5 | 4 |
| `queue_collapse` | 4 | 4 |
| `trust_crash` | 4 | 6 |

All five, against a threshold of four — and none of them from a contrived setup. `queue_collapse` and `trust_crash` both come from the "cut the price to attract customers" run, which is the most plausible beginner mistake in the game and is punished legibly. `margin_trap` comes from buying the £75k upgrade early, which is the trap Scenario spec §5a deliberately left in.

*(These were unreachable as recently as Phase 1. D30 and D31 fixed that; this row is what those decisions bought.)*

**After D46–D63 most counts are lower, and that is intended.** Faults are halved (D51) and drivers no longer join long queues (D48), so `power_choke` and `queue_collapse` now need a mistake rather than a busy day; D58 re-derived `queue_collapse` by D31's method. `reliability_spiral` is the exception, up to 25: since D63 the site starts with no contract, so the "ignores the faults" approach really does leave every fault unrepaired.

## Criterion 4 — decisions matter · **PASS**

Played (`premium + preventive`) against the passive baseline, same seeds, on the corridor hub *(re-measured 2026-11-13, D46–D63; the move from the D58 figures is D59's baseline, which now waits for the contractor)*:

| Seed | Margin | Served | Trust | Goals met |
| :-- | --: | --: | --: | --: |
| pt-1 | +£274 | −42 | +6.7 | **+1** |
| pt-2 | **+£1,125** | −21 | **+12.2** | **+3** |
| pt-3 | +£89 | −58 | −4.2 | −1 |

Seven KPIs move ≥10% against baseline across the playtest seeds: sessions completed, average wait, abandonment rate, kWh delivered, margin, trust, goals met.

The row worth reading twice is pt-3: the same strategy that gains goals on the other two seeds loses one there. **The strategy is not a cheat code**, which is the healthy version of this criterion.

**The three operator questions are answerable from logs** (Phase 3 findings §3): pricing cuts average wait 76% across a 34p range; power policy was worth +12% throughput when the cap binds (since D48 the gain shows as fewer queue abandonments instead, because overload now leaves at the entrance); maintenance pays back on a busy site and loses money on a quiet one.

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
