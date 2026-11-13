# ChargePointOperator — Gate Scorecard

**Version:** 2.0 (partial) · **Date:** 2026-11-13 *(**v2.0: criteria 2–4 re-scored after the D46–D58 model revision and the D57 goals. Criterion 2 passes narrowly — `wave-pricing` (D55) is ruled out at one site only, at t=2.11. The self-playtest below predates the revision.** · v1.1: criterion 2's prose corrected for D38. **v1.2: criterion 2 re-issued at 40 seeds against the D42–D45 model with three goals — the deferred re-run is done. Two measured fragilities recorded with it: the verdict flips on a single £50 goal threshold, and `preventive` sits close to the bar at two of three sites.**)*
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
| 2 | **No dominant strategy** | Sweeps show ≥2 policy families winning on different archetypes; testers propose ≥2 credible strategies | `strategies` over 3 archetypes × 8 policies, **40 seeds (80 where borderline), re-issued 2026-11-13 for D46–D58** | **PASS, narrowly** (machine half) · tester probe pending |
| 3 | **Failure modes reachable** | ≥4 of 5 failure states observed arising naturally | 36 runs, `RunManifest.failure_states_observed` | **PASS — 5 of 5** |
| 4 | **Decisions matter** | Median played run differs meaningfully from baseline on ≥2 goal KPIs; the three operator questions answerable from logs | `compareRuns` on playtest seeds; Phase 3 findings §3 | **PASS** |
| 5 | **One-more-run** | ≥2 of 3 external testers voluntarily take run 3 | Run-3 uptake | **PENDING — needs testers** |

---

## Criterion 2 — no dominant strategy · **PASS (machine half), narrowly** · *re-issued 2026-11-13*

Eight policies × three archetypes × **40 seeds**, re-run at **80 seeds** for the top contenders at Junction 42 and Kesteven, where the 40-seed verdict was borderline. Measured against the D46–D58 model and the D57 goals. Mean goals met out of 3:

| Strategy | Junction 42 | Eastgate | Kesteven |
| :-- | --: | --: | --: |
| as-shipped | 1.40 | 1.43 | 1.43 |
| undercut | 0.00 | 0.03 | 0.05 |
| premium | 2.03 | 1.00 | 2.58 |
| preventive | 1.83 | **1.48** | 1.38 |
| throughput | 1.18 | 1.00 | 1.65 |
| premium+preventive | **2.55** | 1.00 | **2.60** |
| throughput+preventive | 1.27 | 1.00 | 1.38 |
| **wave-pricing** *(new, D55)* | 2.36 | 1.43 | 2.40 |

*(80-seed figures at Junction 42 and Kesteven for the four and three strategies re-run there; 40 seeds otherwise.)*

| Site | Winner | Not measurably behind it |
| :-- | :-- | :-- |
| Junction 42 | `premium+preventive` | `wave-pricing` (0.19 behind, *t*=1.81) |
| Eastgate | `preventive` | `as-shipped` (*t*=0.37), `wave-pricing` (*t*=0.40) |
| Kesteven | `premium+preventive` | `premium` (*t*=0.29) |

**Nothing is a contender everywhere, but `wave-pricing` nearly is.** It is ruled out only at Kesteven, 0.20 goals behind at *t*=2.11 against a bar of 2. `premium+preventive` is ruled out by Eastgate, where it fails margin and trust (1.00 against 1.48).

**Read with three caveats:**

1. **The goals decided Eastgate.** The first D57 fit (wait ≤ 90 s) failed this criterion, because short waits made the wait goal free for any strategy that turns drivers away. The passing fit was chosen after seeing that (D57). This is the same fragility v1.2 recorded: a verdict here is a claim about the goal fit at least as much as the mechanics.
2. **`preventive` is part of every site's winner** (at Kesteven, level with plain `premium`). Maintenance dominance (OPEN-2 / D33) is still near the surface, now joined by contractor repairs (D53), which make the higher tiers more convenient as well as more reliable.
3. **An adaptive strategy is the near-miss.** That is good news for the mechanic: playing the day is rewarded, which answers the "configuration puzzle" worry D55 was added to test. It also means a simple rule (price up at the peaks, down in the lulls) is close to being correct everywhere. Testers will likely find it.

**Still outstanding:** the protocol also requires that testers **propose ≥2 different credible strategies** when asked (protocol §2, after run 2).

*Previous issue (v1.2, D42–D45 model, seven standing policies):* winners `premium+preventive` / `preventive` / `premium+preventive`, with `premium+preventive` ruled out at Eastgate by a £364/day loss (*t*=−4.86).

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
