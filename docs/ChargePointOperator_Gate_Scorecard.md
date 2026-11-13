# ChargePointOperator — Gate Scorecard

**Version:** 2.1 (partial) · **Date:** 2026-11-13 *(**v2.1: criterion 2 FAILS on the D46–D60 model — the adaptive `wave-pricing` rule cannot be ruled out at any site (D61). Criteria 3 and 4 pass. v2.0 (earlier the same day) had criterion 2 passing narrowly. The self-playtest below predates the revision.** · v1.1: criterion 2's prose corrected for D38. **v1.2: criterion 2 re-issued at 40 seeds against the D42–D45 model with three goals — the deferred re-run is done. Two measured fragilities recorded with it: the verdict flips on a single £50 goal threshold, and `preventive` sits close to the bar at two of three sites.**)*
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
| 2 | **No dominant strategy** | Sweeps show ≥2 policy families winning on different archetypes; testers propose ≥2 credible strategies | `strategies` over 3 archetypes × 8 policies, **40 seeds (80 where borderline), re-issued 2026-11-13 for D46–D60** | **FAIL** (machine half): adaptive `wave-pricing` credible everywhere · tester probe pending |
| 3 | **Failure modes reachable** | ≥4 of 5 failure states observed arising naturally | 36 runs, `RunManifest.failure_states_observed` | **PASS — 5 of 5** |
| 4 | **Decisions matter** | Median played run differs meaningfully from baseline on ≥2 goal KPIs; the three operator questions answerable from logs | `compareRuns` on playtest seeds; Phase 3 findings §3 | **PASS** |
| 5 | **One-more-run** | ≥2 of 3 external testers voluntarily take run 3 | Run-3 uptake | **PENDING — needs testers** |

---

## Criterion 2 — no dominant strategy · **FAIL (machine half)** · *re-issued 2026-11-13, D61*

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

**`wave-pricing` cannot be ruled out at any site, so under D38's rule it is a dominant strategy and criterion 2's machine half fails.** It is a single, simple policy: 15% over list in waves well above the day's mean rate, 10% under in the quiet ones, list otherwise, repair on detection. Mark chose the strict reading (D61) over judging the criterion on fixed setups only.

**Fixed setups alone would pass** — three different winners, none credible everywhere — and that is recorded so the scope of the fail is clear: it is the adaptive rule, not any standing policy.

**More seeds will not rescue it.** The gaps shrank as seeds were added (0.25 → 0.15 goals at Junction 42), so they look small but real. Before D59 the verdict passed on *t*=2.11 at Kesteven; D59's baseline change was enough to move it under the bar, which is the same fragility v1.2 recorded.

**What the protocol says next.** Plan §6.2: a fail on criterion 2 means pivot to Operations Balancer — but it frames that as a *fundamental* fail, "it's a solved puzzle or a spreadsheet". This fail is narrow: one adaptive rule is near-best everywhere while no standing policy is. Whether to tune (make the right price adjustment differ by site, then re-test) or pivot is Mark's decision and is not taken here. The tester half of the criterion — whether people propose ≥2 credible strategies — is still to come and will show whether players find this rule.

*Previous issues:* 2026-11-13 morning, D46–D58 with the pre-D59 baseline: PASS narrowly, `wave-pricing` ruled out only at Kesteven (*t*=2.11). v1.2 (D42–D45, seven standing policies): PASS, winners `premium+preventive` / `preventive` / `premium+preventive`.

## Criterion 3 — failure modes reachable · **PASS, 5 of 5**

36 runs: 3 scenarios × 3 playtest seeds × 4 approaches a real player would plausibly take (played straight, ignores the faults, cuts the price to attract customers, buys the upgrade early).

| Failure state | Runs observed in *(2026-11-13, D46–D58)* | *v1.2* |
| :-- | --: | --: |
| `reliability_spiral` | 8 | 16 |
| `power_choke` | 6 | 17 |
| `margin_trap` | 6 | 4 |
| `queue_collapse` | 3 | 4 |
| `trust_crash` | 3 | 6 |

All five, against a threshold of four — and none of them from a contrived setup. `queue_collapse` and `trust_crash` both come from the "cut the price to attract customers" run, which is the most plausible beginner mistake in the game and is punished legibly. `margin_trap` comes from buying the £75k upgrade early, which is the trap Scenario spec §5a deliberately left in.

*(These were unreachable as recently as Phase 1. D30 and D31 fixed that; this row is what those decisions bought.)*

**After D46–D58 every count is lower, and that is intended.** Faults are halved (D51), so `reliability_spiral` is rarer, and drivers no longer join long queues (D48), so `power_choke` and `queue_collapse` now need a mistake rather than a busy day. `queue_collapse` fell to 2 of 20 price-cut seeds at the old threshold; D58 re-derived it at half a car per bay, by D31's method, and it is back to 3 of 36 here.

## Criterion 4 — decisions matter · **PASS**

Played (`premium + preventive`) against the passive baseline, same seeds, on the corridor hub *(re-measured 2026-11-13, D46–D58)*:

| Seed | Margin | Served | Trust | Goals met |
| :-- | --: | --: | --: | --: |
| pt-1 | **+£1,027** | −27 | +3.7 | **+1** |
| pt-2 | +£171 | −30 | +0.6 | **+1** |
| pt-3 | −£77 | −49 | −8.5 | 0 |

Seven KPIs move ≥10% against baseline across the playtest seeds: sessions completed, average wait, abandonment rate, kWh delivered, margin, trust, goals met.

The row worth reading twice is pt-3: the same strategy that gains a goal on the other two seeds costs 8.5 trust there and gains nothing. **The strategy is not a cheat code**, which is the healthy version of this criterion.

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
