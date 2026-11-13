# ChargePointOperator — How the Game Works

**Date:** 2026-11-13 · **Read from:** the code at `6770ec4`, plus D42–D45 in the decision log
**Status:** a description of the game **as built**, like `model-map.html`. It specifies nothing. Where it disagrees with the code, the code is right; where it disagrees with a canonical document, §10 lists the difference so it can be settled there.

This is the plain-language account: what the player does, what pushes back, and where the decisions are meant to be. The formulas are here only where they explain a decision. For every variable and path, open `model-map.html`.

---

## 1. The game in one paragraph

You run one EV charging site for one day: 00:00 to 24:00 in five real minutes at 1×. Drivers arrive in waves. Each one looks at your price, the queue and your reputation, then pulls in or drives on. Pull in and they charge, or queue for a bay. Queue too long and they give up. Bays break, and a broken bay stays broken until you pay to repair it. The grid connection is smaller than the chargers' combined appetite, so at peaks the site runs out of power before it runs out of plugs. At midnight you are scored on three goals: **operating margin, average wait and trust**. Those three pull against each other, and the site you are running decides how hard.

The pitch from D2: *keep one charging site flowing under pressure.*

## 2. The loop

```text
  demand wave ──► drivers arrive ──► each one decides: pull in / drive on
                        ▲                     │
     price thins        │                     ▼
     arrivals ──────────┘          bay free? ── yes ──► charge ──► pay, leave
                                       │                 ▲    │
                                       no                │    └─ fault ─► bay down
                                       ▼                 │                until repaired
                                     queue ── bay frees ─┘
                                       │
                                       └─ waited past patience ─► gives up
            every outcome above moves TRUST, and trust feeds back into
            the next driver's decision
```

The player watches the dashboard and pulls seven levers (§6). Nothing pauses for them, and an action lands on the next tick (one sim-minute).

## 3. What happens each minute

Each tick runs the same pipeline, in this order (`core/tick.ts`, Architecture §4.1):

1. **Your actions apply.**
2. **Arrivals spawn.** The current wave sets a rate. Your price thins it: every 10% above the site's reference price removes about 10% × the wave's elasticity of arrivals, clamped to between 0.3× and 1.5× of the wave rate. Each arrival is one of three driver types, drawn by the wave's mix (§4).

3. **Each arrival decides whether to pull in.** Two tests, and both must pass:
   - **The hard ceiling (D42).** Every driver has a price above which they will not stop. It is a base per type (commuter £0.78, en-route £1.05, panic £1.44) plus a detour premium: how far away the next charger is, valued at their time, spread over the energy they want. A long detour and a small top-up mean they will pay a lot more.
   - **The soft score (D21, D43).** Urgency, minus the wait they think they see, minus how far your price is over **the site's** reference price, plus your reputation:
     `2.0·urgency − 1.0·waitSens·(wait/10 min) − 0.8·priceSens·(overprice/10p) + 0.3·(trust−50)/25 ≥ 0.15`.
     They misjudge the wait by up to ±35% (D31).

   *Worked example:* a typical commuter at the reference price, with trust at 50, will join a queue they think is up to about 11 minutes long. Put the price up 10p and that drops to about 1½ minutes, so in practice they need a free plug. **Price and queue length are traded against each other inside the same driver.**

4. **Placed or queued.** A free compatible bay starts a session. Otherwise the driver queues (capacity 12). If the queue is full, they leave.
5. **Power is shared out.** The grid cap is split across charging bays by your power policy. Each bay gets no more than the charger or the car can take.
6. **Sessions advance.** Energy flows, and a car finishes when it reaches its target charge, or your charging limit if lower.
7. **Faults.** Only bays that are delivering power can fault, at a rate set by the hardware and your maintenance level. A fault ends the session in progress. Each scenario also has **one scripted fault** at a fixed time, which is the designed "something just went wrong" moment.
8. **Queue abandonment.** Once a driver has waited past their patience, the chance they leave rises over 10 minutes to 50% a minute.
9. **Money and reputation update**, then failure states are detected and invariants checked.

## 4. The drivers

Every arrival is one of three types (`ARCHETYPES` in `core/calibration.ts`). Each car is drawn fresh: battery size, maximum charge rate, arrival charge and urgency come uniformly from the type's ranges, and the detour to the next charger from the site's range.

| | **Commuter** | **En-route** | **Panic (low battery)** |
| :-- | :-- | :-- | :-- |
| Who they are | Local, regular, topping up on the way to or from work | Mid-journey, needs enough to reach the destination | Nearly empty, will take whatever is there |
| Battery | 40–80 kWh | 50–80 kWh | 40–70 kWh |
| Car's maximum charge rate | 60–120 kW | 120–250 kW | 50–150 kW |
| Arrives at | 35–55% | 15–35% | 3–12% |
| Charges to | 80% | 80% | 60% |
| Energy wanted (mid-range car) | ~21 kWh | ~36 kWh | ~29 kWh |
| Urgency | 0.3–0.5 | 0.5–0.7 | 0.9–1.0 |
| Price sensitivity | 0.7 | 0.4 | 0.1 |
| Wait sensitivity | 0.6 | 0.5 | 0.2 |
| Patience once queued | 15 min | 20 min | 30 min |
| Base price ceiling (D42) | £0.78 | £1.05 | £1.44 |
| Value of their time (DfT VTT, 2014) | £11.21/hr | £5.12/hr | £5.12/hr |

### What each type will put up with

These are worked from the formulas in §3 for a mid-range driver, at the site's reference price and trust 50. They are what the player is actually negotiating with:

| | Commuter | En-route | Panic |
| :-- | --: | --: | --: |
| Longest queue they'll join (as they perceive it) | ~11 min | ~21 min | ~87 min |
| Price over reference at which they refuse **even with a free bay** | ~12p | ~33p | never; the hard ceiling comes first |
| Hard ceiling at Junction 42 (19-min detour) | £0.95 | £1.10 | £1.50 |
| Hard ceiling at Eastgate (4½-min detour) | £0.82 | £1.06 | £1.45 |
| Hard ceiling at Kesteven (11½-min detour) | £0.88 | £1.08 | £1.48 |

- **Commuters are the price-and-queue-sensitive majority**: about 12p over the going rate and they won't stop even to an empty forecourt. Their high value of time means a long detour buys a real premium (17p at Junction 42), but Eastgate's chargers are 2–7 minutes apart, so there it buys almost nothing. That gap is what D42 built.
- **En-route drivers tolerate a real queue and a real price.** Their low value of time and big energy demand keep the detour premium small, so their ceiling barely changes between sites.
- **Panic drivers** barely register price or wait. They are the source of the overnight business and the reason the corridor can charge more.
- **Trust shifts all of this.** Every 25 points of trust above 50 adds about 5 minutes to the queue a commuter will join, and about 10 minutes for en-route drivers.
- **They misjudge the wait** by up to ±35% either way (D31), so some join queues they'll later abandon.
- **Once a driver is in the queue, only patience matters.** They don't re-check the price. After their patience runs out, the chance they leave rises to 50% a minute over the next 10 minutes. The price they pay is fixed at the moment they plug in.

### Who turns up where

Arrivals per day before price thinning, and the mix across the day:

| Site | Arrivals/day | Commuter / en-route / panic | Site adjustments |
| :-- | --: | :-- | :-- |
| Junction 42 | ~430 | 45% / 39% / 16% | — |
| Eastgate | ~200 | 76% / 17% / 7%, in two sharp commute spikes | patience ×0.8 (a commuter gives up after 12 min) |
| Kesteven | ~126 | 27% / 60% / 13%, daytime only | patience ×3, urgency ×0.7: unhurried shoppers |

The mix moves through the day: panic-heavy overnight, commuter-heavy at the commute peaks, en-route-heavy at midday. That means the right price at 08:00 is not the right price at 13:00, which is the case for playing the day rather than setting it up (§9, item 2).

## 5. How the cars charge

Charging is modelled by **energy, not duration**. Nothing decides in advance how long a car will stay (`systems/charging.ts`).

1. **At plug-in, the car's demand is fixed.** Target charge is the driver's own (80%, or 60% for panic), or your charging limit if lower. `requestedKwh = (target − arrival charge) × battery`. The price per kWh and the connection fee are fixed here too, and the connection fee is earned immediately.
2. **Every minute, power is worked out again.** Each bay's ceiling is `min(charger kW, car's max kW) × taper(charge)`. The grid cap is then shared across the charging bays by your power policy. A car's speed changes from minute to minute depending on who else is plugged in.
3. **Energy builds up minute by minute.** Each minute delivers `allocated kW ÷ 60` kWh, capped at what's still needed. Charge level, revenue and energy cost all update that minute.
4. **The car leaves the moment it has its kWh**, and the bay is free that same minute.
5. **If the bay faults**, the session ends there. The driver keeps (and has paid for) what they got, leaves, and the bay stays down until repaired.

**Typical uncontended session times** (mid-range cars):

| Driver and bay | Energy | Limited by | Time |
| :-- | --: | :-- | --: |
| Commuter on a 150 kW rapid | 21 kWh | the car, ~90 kW | ~14 min |
| En-route on a 150 kW rapid | 36 kWh | the bay, 150 kW | ~14 min |
| En-route on a 350 kW ultra-rapid | 36 kWh | the car, ~185 kW | ~12 min |
| Panic on a 150 kW rapid | 29 kWh | the car, ~100 kW | ~17 min |
| Commuter on a Kesteven 22 kW AC post | 21 kWh | the post, 22 kW | ~57 min |
| Panic on a Kesteven 22 kW AC post | 29 kWh | the post, 22 kW | ~79 min |

**Under a binding grid cap it takes longer.** With six en-route cars plugged in at Junction 42, they want about 970 kW against 650 kW. Equal share gives each about 108 kW, and 14 minutes becomes about 20.

**Which bay a driver gets.** Drivers don't choose. Every car fits every bay, and a new arrival takes the **first free bay in bay order**. When a bay frees, it takes the car at the front of the queue. So at Junction 42 the two 350 kW bays (5 and 6, last in order) only get cars when bays 1–4 are full. At Kesteven the one rapid (post 8) only gets a car when all seven AC posts are taken, so a panic driver at 7% can spend 79 minutes on a 22 kW post with the rapid standing idle beside them.

**The taper never applies in practice.** It is a single step (full power below 80% charge, 40% at or above), and every target is 80% or lower, so every car charges at a flat rate from plug-in to departure. §9 sets out what this and the other simplifications mean for the game.

## 6. The seven levers

| Lever | What it does | What it costs you | When it matters |
| :-- | :-- | :-- | :-- |
| **Price** (£0.45–£1.20/kWh, plus connection fee) | More per kWh. Fewer arrivals, and fewer of those stay. | Volume. Every drive-on costs trust, and drivers turned away by **price** cost extra (D45). | Always. **The strongest single lever** (Phase 3 §3: a 34p range cuts average wait by 76%). |
| **Power policy** — equal share / fast-first / finish-soonest-first / manual | Decides who gets the grid when it runs short. Creates no kilowatts. | — | Only when the cap binds. `queue_relief` is worth +12% throughput then. `fast_first` is a trap that starves marginal bays. Inert at Kesteven by design. |
| **Charging limit** (off / 70% / 60% / 50%) | Caps how full each car gets, so bays turn over faster. **The only lever that raises the throughput ceiling under a binding cap** (D14). | kWh sold, so revenue. −0.1 trust for each driver cut short. | When the queue is the problem and energy is not the money. |
| **Maintenance level** (reactive / standard / preventive) | Fault rate ×1.25 / ×1.0 / ×0.5, repair time ×1.2 / ×1.0 / ×0.7 | £0 / £25 / £150 a day standing. Call-outs are a flat £200 at every level (D33). | Busy sites with heavy hardware. Loses money on a quiet site (Kesteven). |
| **Repair a faulted bay** | Brings it back after 45–60 min (scaled by maintenance level). **A faulted bay stays down until you do this.** | £200 | Every fault. The one lever that is purely reactive. |
| **Open / close bays** | Takes capacity out of service. A busy bay closes when it next goes idle. | Capacity | Rarely helpful. It exists mostly as a way to get into trouble (`queue_collapse`). |
| **Upgrade a charger** (rapid 150 kW → ultra-rapid 350 kW for £75,000; at Kesteven also AC 22 kW → rapid for £35,000) | More power per bay | Out of £100,000 starting cash. Comes out of cash, **not** the margin goal; it is judged by `margin_trap` instead. | Mostly a trap: it buys nothing at peaks, where the grid, not the charger, is the limit (Scenario §5a). This is where `margin_trap` comes from. |

## 7. What you are scored on, and what pushes back

**Three goals, checked at midnight** (D44): cumulative operating margin, all-day average wait, and end-of-day trust. Each site's goals are set so that changing nothing fails at least one goal on ≥80% of seeds (D13).

**Margin** = kWh × price + connection fees − energy at £0.28/kWh − maintenance − site running costs.

**Trust** starts at 60. It moves on the exceptional, not the routine (D30):

| Event | Trust |
| :-- | --: |
| Served with under 5 min wait | +0.1 |
| Served after a longer wait | −0.05 |
| Driver drives on, for any reason | −0.15 |
| …and it was the price | further −0.2 |
| Driver gives up in the queue | −1.5 |
| Fault mid-session / on an idle bay | −2.0 / −0.5 |
| Driver cut short by your charging limit | −0.1 |
| Each hour uptime stays above 98% | +0.5 |

Trust can move at most ±5 in any rolling hour, so it is slow to recover. It feeds back into every arrival's decision, which is what makes reputation a resource rather than a score.

**Five failure states** are detected and logged but never end the day (D41). Each one is the shape of a classic mistake:

| State | Roughly | Typical cause |
| :-- | :-- | :-- |
| `queue_collapse` | A car queued for every bay, a third walking away, for 30 min | Price cut, or bays closed |
| `power_choke` | Grid ≥95% drawn with 3+ queued, for 30 min | Peaks, especially with faults |
| `reliability_spiral` | Uptime <85% with 3+ bays down, for an hour | Faults left unrepaired |
| `margin_trap` | You spent capital and met no more goals than doing nothing would have (judged against the same-seed baseline at close) | Early £75k upgrade |
| `trust_crash` | Trust below 40 and falling | Underpricing into long queues |

## 8. The three sites

The same rules on three different sites. Gate criterion 2 needs the right answer to change between them.

| | **Junction 42 Services** (corridor) | **Eastgate Park & Charge** (commuter) | **Kesteven Garden Centre** (destination) |
| :-- | :-- | :-- | :-- |
| Hardware | 4 × 150 kW + 2 × 350 kW | 6 × 150 kW | 7 × 22 kW AC + 1 × 150 kW |
| Grid cap | 650 kW (50% of nameplate) | 450 kW | 350 kW |
| Starting price / reference | £0.79 / £0.79 | £0.72 / £0.72 | £0.55 / £0.62 |
| Detour to next charger | 8–30 min (captive) | 2–7 min (competitive) | 5–18 min |
| Drivers | Mixed, panic overnight, high volume | Commuter-heavy, less patient (×0.8) | Patient (×3), less urgent |
| Goals: margin / wait / trust | £3,200 / 7 min / 55 | £1,000 / 4.2 min / 61 | £300 / 8 min / 61 |
| What it teaches | You have pricing power, so use it; reputation is the hard goal | You have no pricing power; margin is the hard goal | Ships underpriced; maintenance doesn't pay here |
| Best standing policy (40 seeds) | premium + preventive | preventive | premium + preventive |
| Price optimum (D43) | ~£0.90 | ~£0.75 | ~£0.70 |

The day's shape on the corridor: a sparse, panic-heavy night, then the morning commute, a lull, a midday en-route surge with **the scripted fault on the 350 kW bay 5 at 12:30**, a recovery window, then the evening peak, the hardest stretch of the day.

## 9. Where the core mechanic is strong, and where it is thin

These are observations from the code and the measured findings, offered as the agenda for the playtest, not as verdicts.

**Strong:**

- **Every lever has a mechanism and a cost.** Phase 3 measured 19 of 19 sanity gradients behaving as specified, and all three operator questions have measured answers.
- **Each failure state is a recognisable mistake**, not a contrived setup. The most plausible beginner move, cutting the price to attract customers, produces `queue_collapse` and `trust_crash` legibly.
- **Since D42/D43 the price decision depends on the site.** A 15% rise is worth +£197 at Junction 42 and −£364 at Eastgate. Before that, £0.85 was correct everywhere and pricing was a lookup.

**Thin, or not yet tested:**

1. **Price carries most of the game.** It controls congestion, margin and (through rejections) trust all at once. Power policy and the charging limit matter only while the grid cap binds, the upgrade is a designed trap, and closing bays has little upside. A player who finds the right price and preventive maintenance has most of the value.
2. **Nobody has measured whether playing the day beats setting it up well.** Every strategy in the criterion 2 test is a **standing policy fixed at 00:00**. Whether changing the price between waves, reacting to faults or shifting power policy at peaks beats the best fixed setting is unmeasured. If it doesn't, the game is a configuration puzzle with a fault-repair chore attached. This is the most important open question about the mechanic, and gate criterion 5 is where it will show.
3. **Two of the three goals get easier as you serve fewer people.** An empty forecourt has a perfect average wait (D44). Margin is the only counterweight, plus the D45 price-rejection penalty added to stop premium pricing dominating. The balance between strategies is a property of **the goal values** as much as the mechanics: criterion 2 flipped on one £50 change to Kesteven's margin goal.
4. **Maintenance is close to dominant.** `preventive` sits near the separation bar at two of three sites (D45, OPEN-2 carried forward).
5. **The repair decision has no real choice in it.** At £200 against a lost bay for the rest of the day, you always repair. What tests skill is *how quickly you notice*; in the self-playtest the 12:30 fault sat for 47 sim-minutes with the alert showing.
6. **Trust responds slowly.** Capped at ±5 an hour and spread over many small events, its cause and effect may be hard to read within a five-minute day. That is gate criterion 1's question.
7. **The charging taper never applies** (§5). No driver targets more than 80% and the charging limits stop at 70%, so every session ends at or before the 80% step (Architecture §6 says so: "a session targeting 0.80 never enters the taper zone"). **In practice every car charges at a flat rate from plug-in to departure.**
8. **So the charging limit works for a simpler reason than the real one.** On a real site, capping at 70% pays off because the last stretch of a charge is the slowest. Here the saving is only the straight-line kWh not sold. The lever still does something, but players who know EVs may notice that it isn't doing the real thing.
9. **Sessions are probably short.** Flat-rate charging gives uncontended DC sessions of about 12–17 minutes (a mid-range commuter is 21 kWh at ~90 kW in ~14 min; an en-route car is 36 kWh in ~14 min on 150 kW or ~12 min on 350 kW). Real UK rapid sessions are believed to run nearer half an hour, mostly because of the taper. *This comparison has not been checked against a source.* Faster turnover means less queue pressure for a given number of arrivals, and the ×1.8 demand scaling at Junction 42 may be partly making up for it.
10. **No overheads and no overstay.** The model has no plug-in or set-up time and no losses (kWh delivered is exactly kWh billed). A bay frees the minute a car finishes, so nobody stays plugged in after they're done. Bay-blocking is a real operator problem and a possible lever (idle fees) that the game doesn't have.
11. **The session-length estimate is made once, at plug-in, at full power.** It sets the per-minute fault risk (`charging.ts:26-31`). The remaining-time figures used for `queue_relief` ordering and the wait drivers see are recalculated from the current power, so those stay accurate.
12. **Drivers don't choose a bay, and the site doesn't match cars to bays** (§5). Arrivals take the first free bay in bay order. At Kesteven a panic driver can sit on a 22 kW post for over an hour while the rapid is idle, and at Junction 42 the 350 kW bays are used last. A car that can take 250 kW gets a 150 kW bay as readily as a 350 kW one. Bay matching is a plausible operator lever the game doesn't offer, and it would give the upgrade a reason to exist.
13. **Driver types are the same on every site.** Only the mix, the detour range and two multipliers (patience, urgency) differ. Arrival charge, battery and car ranges do not, so a Kesteven shopper arrives as empty as a motorway driver.

**On a realistic charging curve:** power falling from about 50–60% charge would make the charging limit a genuine choice and lengthen sessions. It would also shift every calibrated number, including the goals and the criterion 2 result. Treat it as a Phase 5 change after the playtest, not a fix before it; changing it now would invalidate the three criteria already scored.

## 10. Where the canonical documents have drifted from the code

The README rule is that documents win over code, so each of these needs settling in the document, or a decision that the code is wrong.

| Document | Says | Code says | Since |
| :-- | :-- | :-- | :-- |
| `Scenario_RoadsideHub.md` §2 | Bays 4 × 50 kW + 2 × 150 kW | 4 × 150 kW + 2 × 350 kW | Re-rating, 2026-08-17 |
| same | Grid cap 350 kW | 650 kW | same |
| same | Starting cash £50,000 | £100,000 | same |
| same | Upgrade £40,000 | £75,000 | same |
| same, §3 | Wave rates as listed, ≈239 arrivals/day | Every rate × 1.8 (`DEMAND_SCALE`) | same |
| same, §3 load maths and §5a | Throughput and upgrade analysis against 350 kW / 50→150 kW | — | same (the conclusions may still hold; the numbers do not) |
| `Architecture.md` §6 | `siteScore` reads `archetypeReferencePrice` | The site's `referencePricePerKwh` (D43) | D43, 2026-08-20 |
| same | `accepted … AND price <= demand.maxAcceptablePricePerKwh` with no mention of where the ceiling comes from | Ceiling = archetype base + detour premium (D42) | D42, 2026-08-20 |
| same | Trust: `+ completionBonus … − rejectPenalty` | Completion 0, fast/slow completion, site rejection + price-rejection extra (D30, D45) | D30 / D45 |
| `Phase3_Findings.md` §3 Q3 | Corridor "at its own 350 kW" | 650 kW | Re-rating (the finding is dated before it) |
| `KPI_Dictionary.md`, `margin_trap` | "you spent £40k and it bought nothing" | £75k | Re-rating |
| `calibration.ts` header | "mirror of Calibration.md v2.2" | Calibration sheet is now v3.4 | — |
