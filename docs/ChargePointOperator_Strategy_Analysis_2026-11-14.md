# ChargePointOperator — Strategy Analysis: Why Days End Just Short

**Version:** 1.2 · **Date:** 2026-11-14 *(v1.2: §5b, the good-player benchmark results · v1.1: §5a, how "Turned away" is calculated)*
**Companions:** `ChargePointOperator_Calibration.md` §7 (measured baseline) · `ChargePointOperator_Decision_Log.md` (D13, D22, D57, D59, D63) · `ChargePointOperator_Gate_Scorecard.md` (criterion 2)
**Status:** analysis and options only. No decision taken and no code changed. The order of work is Mark's call (§5).

---

## 1. The question

Mark's report: winning now feels almost impossible. Days keep ending extremely close to the goals without meeting them. Is the game just finely tuned, or is something else going on?

**Short answer:** it's mostly how the goals were set, with a large amount of luck on top. The model isn't broken, and nothing changed recently to make it harder.

## 2. What was measured

All runs are on `main` at `576fba7`, using the headless sim (`node --import tsx src/game/headless.ts …`; plain `npx tsx` can't open its IPC pipe inside the Claude sandbox).

### 2a. The passive benchmark (D22 baseline), 40 seeds per site

| Site | Margin met | Wait met | Trust met | All three (a win) |
| :-- | --: | --: | --: | --: |
| Junction 42 | 38% | 50% | 25% | **8%** |
| Eastgate | 18% | 95% | 20% | **12%** |
| Trevithick | 23% | 68% | 43% | **12%** |

### 2b. The best built-in strategy at each site, 20 seeds per cell

| Site | Best strategy | Win rate |
| :-- | :-- | --: |
| Junction 42 | premium + preventive | 60% |
| Trevithick | premium (and premium + preventive, wave pricing) | 45% |
| Eastgate | as shipped (nothing tested does better) | **20%** |

At Eastgate, raising the price lifts margin but costs trust, and both goals (£1,450, trust 70) sit above what the site normally makes.

### 2c. Things ruled out

- **No recent regression.** Starting the baseline on the standard contract gives identical results to the D63 no-contract start (the baseline takes the contract at minute 0). D59, D63 and D64 didn't move the baseline.
- **The gap between today's figures and calibration §7 is sampling noise.** Re-running the same 20 seeds reproduces §7, and the 40-seed figures differ only because they include different days. 20 seeds is too few to place a median-based line precisely.

## 3. Why it happens

1. **The goals are set too tight.** D57 placed each goal at about the median of the baseline's results, so each is met on about half of days. A win needs all three on the same day, which comes to roughly 1 in 8. Because each line sits where results bunch up, the typical day lands just short on one goal. That's the "extremely close" feeling.
2. **Nothing checks that the game can be won.** D13 only checks that the game isn't too easy: the baseline must fail at least one goal on ≥80% of days. Nothing checks that a good player can win, so the goals could drift out of reach with every test still passing. At Eastgate they have.
3. **The player starts behind the benchmark.** Since D63 the player starts with no contract, but the goals were fitted to a baseline running the standard contract.
4. **Luck counts for too much** (§4).

## 4. How the seed affects results

The seed picks which "day" you get. The sim has one stream of random numbers, started from the seed (`src/game/core/rng.ts`), and every random event takes the next number in turn:

- **Who turns up:** how many cars arrive each minute, which type each one is, and each car's battery size, top charging speed, starting charge, target charge, detour distance and urgency (`arrivals.ts`).
- **How drivers judge the queue:** the ±35% misjudgement of the wait they can see (`admission.ts`).
- **Queue abandonment:** whether a waiting driver gives up once their patience runs out (`queue.ts`).
- **Faults:** whether a charging bay breaks each minute, and what kind of fault it is (`faults.ts`). The scripted fault isn't random: it happens at the same time on the same bay every day.

New seed and Free play pick a random `s1`–`s9999` (`src/ui/seeds.ts`).

**How much it matters:** a lot. Over 60 baseline days at Junction 42 with identical play, arrivals ranged from 395 to 489 and faults from 1 to 7.

| Link | Correlation |
| :-- | --: |
| Faults → margin | −0.81 |
| Faults → trust | −0.62 |
| Arrivals → trust | −0.60 |
| Arrivals → wait | +0.38 |
| Faults → wait | −0.29 |

Faults are the biggest single factor. Much of what separates a win from a near miss is how many faults the day dealt you.

**The catch: a seed only fixes the day if you play it the same way.** An action that changes how many random numbers get drawn shifts every draw after it, and so reshuffles the rest of the day. A price change can do this because it changes the arrival rate. So can anything that changes how many bays are charging, because faults are rolled per charging bay. Experiment at Junction 42, price changed for one hour (10:00–11:00) on the same seeds:

- A 1p change for one minute did nothing on all five days.
- £0.85 for one hour kept the same day on s1, s3 and s5: the same arrivals and faults, with only the margin moving by the extra hour's revenue (on s3 that was enough to cross the £4,000 goal). On s2, s4 and s6 it reshuffled the day: on s2 faults went from 3 to 4 and goals from 2 to 0.
- £0.89 for the same hour took s5 from 0 goals to 3, mostly because that day now had 2 faults instead of 4, not because the price was clever.

| Seed | Baseline | £0.85 for one hour | £0.89 for one hour |
| :-- | :-- | :-- | :-- |
| s1 | £4,200 · 2 faults · 2 goals | £4,224 · 2 faults · 2 goals | £4,166 · 2 faults · 1 goal |
| s2 | £3,966 · 3 faults · 2 goals | £3,653 · 4 faults · 0 goals | £3,305 · 5 faults · 1 goal |
| s3 | £3,988 · 3 faults · 1 goal | £4,009 · 3 faults · 2 goals | £4,023 · 3 faults · 2 goals |
| s4 | £3,681 · 4 faults · 0 goals | £3,752 · 3 faults · 1 goal | £3,854 · 3 faults · 1 goal |
| s5 | £3,870 · 4 faults · 0 goals | £3,899 · 4 faults · 0 goals | £4,634 · 2 faults · 3 goals |
| s6 | £3,464 · 5 faults · 1 goal | £3,708 · 4 faults · 1 goal | £3,573 · 4 faults · 1 goal |

So replaying a seed isn't a controlled re-run once you act differently. From one day's result you can't tell how much was your decisions and how much was the faults you got. The strategy test has the same weakness: each strategy ends up playing a different day, so it needs many seeds to tell strategies apart.

## 5. What we could change

| # | Change | What it means in practice | Likely result | Value | Effort |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | **Make a seed a fixed day** | The same cars arrive and the same bays break at the same times whatever you do. Only your decisions change the result. | Replaying a seed becomes a fair second attempt, and wins and losses reflect your play. Tests need about half as many days to give clear answers. | **High.** It fixes the "was it me or luck?" problem. | Medium. Every recorded figure has to be re-measured once. |
| 2 | **Even out fault luck** | Keep the same average number of faults but narrow the spread, so a typical day is 2–5 faults rather than 1–7. | Fewer days are decided before you've done anything. | **Medium–high** | Small–medium. It's a model change, so it needs a decision. |
| 3 | **Build a "good player" benchmark** | A scripted player that does what a competent human would: changes price with demand, takes a contract, closes broken bays and uses charging limits at peak times. | We'd know the real best win rate at each site instead of guessing. | **High.** It's the missing measurement, and 4 and 5 depend on it. | Medium |
| 4 | **Add a "can it be won?" check** | Alongside D13's "the passive benchmark wins at most about 20%", add "the good player wins at least about 60%". | The game can't quietly become unwinnable again after future changes. | **High**, for little extra work | Small, once 3 exists |
| 5 | **Re-fit the goals** | Set the goals so that both checks in 4 pass at every site, over 40+ seeds. | Good play wins most days. Eastgate goes from about 20% to winnable, and the line no longer sits where most results land. | **Highest direct effect** on the near misses | Small, once 3 and 4 exist |
| 6 | **Account for the no-contract start** | Either fit the goals to the player's real starting point, or keep it as a deliberate challenge. | Removes a hidden handicap, or makes it a deliberate one. | Small–medium | Small. It's a design call. |

**Quick option:** lower each goal a notch now, before any of the above. It's about an hour's work and makes wins more common immediately. But it's a guess, not a measured fit, and it doesn't touch luck.

**Recommended order:** 3, 4 and 5 first, since they directly fix "close but never winning". Then 1, which makes every later re-tune more precise and makes replays fair. 2 and 6 are design decisions to take along the way.

**Proposed targets for 4** (not yet agreed): passive benchmark wins about 10–20% of days, good player about 60–70%.

## 5a. How "Turned away" is calculated

The "Turned away" card adds up two kinds of driver who left without charging (`KpiCardGrid.tsx`):

1. **Drove on at the entrance (`rejectedSite`).** Nearly all of the count is this.
2. **No space (`siteFull`).** The queue was already 12 deep. This almost never happens: it was zero on every day in the 40-day runs.

**How a driver decides to drive on** (`src/game/systems/admission.ts`). Each arriving driver gives the site a score and drives on if it comes out below 0.15:

```
score = 2.0 × urgency
      − 1.0 × wait sensitivity  × (wait they think they'll have ÷ 10 min)
      − 0.8 × price sensitivity × (price − the site's going rate) ÷ 10p
      + 0.3 × (trust − 50) ÷ 25
```

- **Urgency** is drawn per driver. Low-battery drivers are 0.9–1.0, commuters 0.3–0.5. At Trevithick everyone's urgency is cut to 70%.
- **Wait** is the wait the sim forecasts: it works through the queue against when each working bay will free up. Broken and closed bays aren't counted, so a fault makes the forecast jump straight away. Each driver then misjudges the forecast by up to ±35% either way.
- **Price** is measured against the site's going rate (£0.79 at Junction 42, £0.72 at Eastgate, £0.62 at Trevithick), not against the price you start on.
- **Trust** above 50 makes drivers more willing to stay, and below 50 less willing.

Separately, a driver also drives on if your price is above their personal ceiling, whatever their score. That ceiling is a base for their type plus a premium that rises with how far they'd have to drive to the next charger (D42).

**Two more things worth knowing:**
- **Each drive-on costs trust:** −0.15, plus a further −0.2 if the price was above that driver's ceiling (D45). So drive-ons pull trust down, which makes more people drive on.
- **High prices also put people off before they arrive** (the arrival-rate elasticity, D21). Those drivers never appear, so they don't count as turned away.

**Typical levels:** about 36% of arrivals at Junction 42, 30% at Eastgate and 44% at Trevithick (calibration §7). Trevithick is highest because its drivers are in no hurry and its chargers are slow, so even a short queue looks long. Now that new players start at Trevithick, a lot of drive-ons there is normal, not a sign of playing badly.

The card's tooltip and the end-of-day panel split drive-ons into price or wait as the main reason (D60). The reason is whichever cost more on that driver's score, or price whenever they were over their ceiling.

## 5b. The good-player benchmark (item 3) — results

**Built:** `src/game/experiment/goodPlayer.ts` (the player), `src/game/experiment/benchmark.ts` (the search), `npm run sim -- bench --scenario <site>` (the command). Tests in `tests/goodPlayer.test.ts`.

**What the good player does.** It uses only what the dashboard shows and the controls a person has. It never sees the random draws or a driver's hidden ceiling. Its settings:

- which contract to take in the first minute;
- a standing price, as a multiple of the starting price;
- a markup at the peaks and a discount in the lulls;
- a further markup while the wait forecast is over a threshold;
- a charging limit while the forecast is over that threshold;
- the power policy;
- whether to call out repairs on a contract or wait for the contractor.

**How it was tuned.** The search tunes on 16 days (`t1`–`t16`), changing one setting at a time and keeping any change that wins more, until a full pass changes nothing. The winning settings are then scored on 40 different days (`v1`–`v40`), alongside the baseline on the same days. Only the fresh-day figures are quoted, because a search always looks better on the days it was tuned on. The search can miss better combinations, so these win rates are a floor on what good play can do, not a ceiling.

| Site | Good player wins | Baseline wins | Best settings found | Goals met by good player (margin / wait / trust) |
| :-- | --: | --: | :-- | :-- |
| Junction 42 | **88%** | 10% | preventive contract, price ×1.05 (£0.83), ±5% at peaks and lulls | 93% / 100% / 95% |
| Trevithick | **83%** | 13% | no contract, price ×1.30 (£0.72), ±10% at peaks and lulls, +20% while the forecast wait is over 5 min | 90% / 100% / 88% |
| Eastgate | **25%** | 3% | standard contract, price ×1.10 (£0.79), 90% charging limit while the forecast wait is over 5 min | **28%** / 100% / 55% |

Mean results on the fresh days: Junction 42 £4,421, 142 s, trust 64.6. Trevithick £700, 18 s, trust 67.7. Eastgate £1,227, 41 s, trust 69.6. Raw output in `runs/bench-*.json` (git-ignored, so local only; re-run `bench` to regenerate).

**What it shows:**

1. **Junction 42 and Trevithick can be won.** Good play wins about 85% of days there. The near misses at those sites come from the settings, not from the game being impossible.
2. **The main lever is price, and the right price is higher than the starting price.** Every site's best settings charge more than the price the day opens on. At Trevithick the starting price (£0.55) is well below the site's going rate (£0.62), and the best price is £0.72. A player who leaves the price alone, or nudges it a few pence, is playing the baseline.
3. **Eastgate is the real problem.** Even the good player meets the £1,450 margin goal on only 28% of days, and averages £1,227. Its trust goal of 70 is also only met on half of days. These goals are out of reach, not just tight.
4. **The static strategies undersold good play.** §2b's best fixed strategies won 60%, 45% and 20%. Letting the price follow the queue and the waves, and finding the right price level, lifts that to 88%, 83% and 25%.

**Against the proposed targets (§5, item 4: baseline 10–20%, good player 60–70%):** the baseline passes at Junction 42 and Trevithick, and is below the range at Eastgate (3%). The good player is *above* the range at Junction 42 and Trevithick, and well below it at Eastgate. So the re-fit (item 5) would make Junction 42 and Trevithick slightly harder for a good player, and make Eastgate's margin and trust goals reachable.

## 6. Open

1. Agree the win-rate targets for the new check (§5, item 4), now that §5b gives the good player's actual rates.
2. Choose the order of work, or the quick option.
3. Decide on item 6: should the no-contract start be a handicap or a starting point the goals allow for?
