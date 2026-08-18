# ChargePointOperator — Gate Scorecard

**Version:** 1.1 (partial) · **Date:** 2026-08-18 *(v1.1: criterion 2's prose corrected for D38 — its 8-seed table is below the evidence floor D38 established, and its "three distinct winners" claim was never robust. The numbers are **not** re-issued here; that wants a ≥40-seed run and is deferred to the tester pass.)*
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
| 2 | **No dominant strategy** | Sweeps show ≥2 policy families winning on different archetypes; testers propose ≥2 credible strategies | `strategies` over 3 archetypes × 7 policies — the §"Criterion 2" table is an 8-seed run **awaiting re-issue at ≥40 (D38)** | **PASS** (machine half, measured at 40 seeds) · tester probe pending |
| 3 | **Failure modes reachable** | ≥4 of 5 failure states observed arising naturally | 36 runs, `RunManifest.failure_states_observed` | **PASS — 5 of 5** |
| 4 | **Decisions matter** | Median played run differs meaningfully from baseline on ≥2 goal KPIs; the three operator questions answerable from logs | `compareRuns` on playtest seeds; Phase 3 findings §3 | **PASS** |
| 5 | **One-more-run** | ≥2 of 3 external testers voluntarily take run 3 | Run-3 uptake | **PENDING — needs testers** |

---

## Criterion 2 — no dominant strategy · **PASS (machine half)** · *table awaiting re-issue*

> **The table below is superseded and is not a verdict.** It is the original
> 8-seed run, and D38 puts 8 seeds under this test's evidence floor — re-judged
> today, that same sample reads `INCONCLUSIVE`, because at 8 seeds
> `premium+preventive` cannot be ruled out on any of the three archetypes. The
> criterion does still pass: measured at 40 seeds while D38 was being settled,
> no strategy is a contender everywhere. What is missing here is a re-issued
> table at ≥40 seeds, deferred to the tester pass rather than done piecemeal.

Seven standing policies × three archetypes × **8 seeds**, scored by mean goals met:

| Site | Winner (8 seeds — superseded) | Goals |
| :-- | :-- | --: |
| Junction 42 (corridor) | `preventive` | 3.38 |
| Eastgate (commuter) | `premium+preventive` | 2.75 |
| Kesteven (destination) | `premium` | 3.13 |

**What survives at 40 seeds:** buy reliability where things break, charge more where demand is captive, and neither answer transfers. `preventive` tops Junction 42 but sits **0.55 goals** behind on Kesteven and is ruled out there; `premium` tops Kesteven but is **1.15 goals** behind on Junction 42, sixth of seven. That separation is well outside noise, and it holds whichever way the two unresolved ties fall.

**What does not survive is "three distinct winners, one per site"** — the claim this section used to make. It was an artefact of a thin sample: the same code answered three winners at 8 seeds, two sharing a component at 10, and two genuinely distinct at 40, with a 0.100-goal gap and a paired *t* of 0.75 deciding the last of those. Counting who came first was the wrong measurement, which is what D38 changed; the finding above is the durable form of the same point.

The technicality this section once recorded escaping is worth re-reading rather than deleting. After D33 resolved OPEN-2 there were three distinct winners; before it, two "distinct" winners both contained `preventive` and the criterion passed on a letter rather than its meaning. At 8 seeds it is back in exactly that position — which is both the case for judging separation instead of ranking, and the case for not reading a verdict off a sample this size.

**Still outstanding:** the protocol also requires that testers **propose ≥2 different credible strategies** when asked. That half is a tester probe (protocol §2, after run 2).

## Criterion 3 — failure modes reachable · **PASS, 5 of 5**

36 runs: 3 scenarios × 3 playtest seeds × 4 approaches a real player would plausibly take (played straight, ignores the faults, cuts the price to attract customers, buys the upgrade early).

| Failure state | Runs observed in |
| :-- | --: |
| `power_choke` | 17 |
| `reliability_spiral` | 16 |
| `trust_crash` | 6 |
| `queue_collapse` | 4 |
| `margin_trap` | 4 |

All five, against a threshold of four — and none of them from a contrived setup. `queue_collapse` and `trust_crash` both come from the "cut the price to attract customers" run, which is the most plausible beginner mistake in the game and is punished legibly. `margin_trap` comes from buying the £40k upgrade early, which is the trap Scenario spec §5a deliberately left in.

*(These were unreachable as recently as Phase 1. D30 and D31 fixed that; this row is what those decisions bought.)*

## Criterion 4 — decisions matter · **PASS**

Played (`premium + preventive`) against the passive baseline, same seeds, on the corridor hub:

| Seed | Margin | Served | Trust | Goals met |
| :-- | --: | --: | --: | --: |
| pt-1 | −£46 | −43 | +1.8 | 0 |
| pt-2 | **+£552** | −50 | **+16.9** | **+2** |
| pt-3 | −£101 | −66 | +3.6 | 0 |

Seven KPIs move ≥10% against baseline across the playtest seeds: sessions completed, average wait, abandonment rate, kWh delivered, margin, trust, goals met.

The row worth reading twice is pt-1 and pt-3: the same strategy that wins pt-2 outright is roughly neutral on the other two seeds. **The strategy is not a cheat code**, which is the healthy version of this criterion.

**The three operator questions are answerable from logs** (Phase 3 findings §3): pricing cuts average wait 76% across a 34p range; power policy is worth +12% throughput when the cap binds and nothing when it does not; maintenance pays back on a busy site and loses money on a quiet one.

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
