# ChargePointOperator — How the Game Works

**Date:** 2026-11-13 · **Read from:** the code after the D46–D60 revision (branch `model-revision-d46`)
**Status:** a description of the game **as built**, like `model-map.html`. It specifies nothing. Where it disagrees with the code, the code is right; where it disagrees with a canonical document, §10 lists the difference so it can be settled there.

This is the plain-language account: what the player does, what pushes back, and where the decisions are meant to be. The formulas are here only where they explain a decision. For every variable and path, open `model-map.html`.

---

## 1. The game in one paragraph

You run one EV charging site for one day: 00:00 to 24:00 in five real minutes at 1×. Drivers arrive in waves. Each one looks at your price, the queue and your reputation, then pulls in or drives on. Pull in and they charge, or queue for a bay. Queue too long and they give up. Bays break, and a broken bay stays down until a repair is done: your maintenance contractor comes after a while, or you can pay extra to call one out sooner. The grid connection is smaller than the chargers' combined appetite, so at peaks the site runs out of power before it runs out of plugs. At midnight you are scored on three goals: **operating margin, average wait and trust**. Those three pull against each other, and the site you are running decides how hard.

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
   - **The hard ceiling (D42).** Every driver has a price above which they will not stop. It is a base per type (commuter £0.80, en-route £1.06, panic £1.46) plus a detour premium: how far away the next charger is, valued at their time, spread over the energy they want. A long detour and a small top-up mean they will pay a lot more.
   - **The soft score (D21, D43).** Urgency, minus the wait they think they see, minus how far your price is over **the site's** reference price, plus your reputation:
     `2.0·urgency − 1.0·waitSens·(wait/10 min) − 0.8·priceSens·(overprice/10p) + 0.3·(trust−50)/25 ≥ 0.15`.
     They misjudge the wait by up to ±35% (D31).

   *Worked example:* a typical commuter at the reference price, with trust at 50, will join a queue they think is up to 5 minutes long (D48). Put the price up 10p and that drops to under a minute, so in practice they need a free plug. **Price and queue length are traded against each other inside the same driver.**

4. **Placed or queued.** The driver takes the free bay that charges their car fastest (D50). If none is free they queue (capacity 12), first come first served. If the queue is full, they leave.
5. **Power is shared out.** The grid cap is split across charging bays by your power policy. Each bay gets no more than the charger or the car can take.
6. **Sessions advance.** Energy flows, and a car finishes when it reaches its target charge, or your charging limit if lower.
7. **Faults and repairs.** Only bays that are delivering power can fault, at a rate set by the hardware and your maintenance level (about 2 random faults a day on the corridor, D51). A fault ends the session in progress. On a maintenance contract the contractor starts the repair after 30 min (standard) or 15 min (preventive), D53. Each scenario also has **one scripted fault** at a fixed time, which is the designed "something just went wrong" moment; it skips a bay you have closed.
8. **Queue abandonment.** Once a driver has waited past their patience, the chance they leave rises over 10 minutes to 50% a minute.
9. **Money and reputation update**, then failure states are detected and invariants checked.

## 4. The drivers

Every arrival is one of three types (`ARCHETYPES` in `core/calibration.ts`). The **car** is drawn from one range whatever the type (D46): battery 40–80 kWh, maximum charge rate 50–250 kW. The **driver** brings their type's arrival charge, target, urgency, sensitivities and patience, and a detour to the next charger drawn from the site's range.

| | **Commuter** | **En-route** | **Panic (low battery)** |
| :-- | :-- | :-- | :-- |
| Who they are | Local, regular, topping up on the way to or from work | Mid-journey, needs enough to reach the destination | Nearly empty, will take whatever is there |
| Battery / car's max charge rate | 40–80 kWh / 50–250 kW | same | same |
| Arrives at | 35–55% | 15–35% | 3–12% |
| Wants to leave at (D47) | 80–90% | 80–100% | 60–80% |
| Energy wanted (mean) | ~24 kWh | ~39 kWh | ~37.5 kWh |
| Urgency | 0.3–0.5 | 0.5–0.7 | 0.9–1.0 |
| Price sensitivity | 0.7 | 0.4 | 0.1 |
| Wait sensitivity (D48) | 1.3 | 1.05 | 0.875 |
| Patience once queued (D49) | 8 min | 12 min | 20 min |
| Base price ceiling (D42) | £0.80 | £1.06 | £1.46 |
| Value of their time (DfT VTT, 2014) | £11.21/hr | £5.12/hr | £5.12/hr |

### What each type will put up with

Worked from the formulas in §3 for a mid-range driver, at the site's reference price and trust 50. These are what the player is actually negotiating with:

| | Commuter | En-route | Panic |
| :-- | --: | --: | --: |
| Longest queue they'll join (as they perceive it) | 5 min | 10 min | 20 min |
| Price over reference at which they refuse **even with a free bay** | ~12p | ~33p | never; the hard ceiling comes first |
| Hard ceiling at Junction 42 (19-min detour) | £0.95 | £1.10 | £1.50 |
| Hard ceiling at Eastgate (4½-min detour) | £0.84 | £1.07 | £1.47 |
| Hard ceiling at Kesteven (11½-min detour) | £0.89 | £1.09 | £1.49 |

- **Commuters are the price-and-queue-sensitive majority**: about 12p over the going rate and they won't stop even to an empty forecourt, and they won't join more than a 5-minute queue. Their high value of time means a long detour buys a real premium (15p at Junction 42), but Eastgate's chargers are 2–7 minutes apart, so there it buys almost nothing. That gap is what D42 built.
- **En-route drivers tolerate a longer queue and a real price.** Their low value of time and big energy demand keep the detour premium small, so their ceiling barely changes between sites. They are also the ones charging past 80%, where it gets slow.
- **Panic drivers** barely register price, and they will queue longest. They are the source of the overnight business and the reason the corridor can charge more.
- **Trust shifts all of this.** Every 25 points of trust above 50 adds about 2½ minutes to the queue a commuter will join, and about 3 for en-route drivers.
- **They misjudge the wait** by up to ±35% either way (D31), so some join queues they'll later abandon.
- **Once a driver is in the queue, only patience matters.** They don't re-check the price. After their patience runs out, the chance they leave rises to 50% a minute over the next 10 minutes. The price they pay is fixed at the moment they plug in.

### Who turns up where

Arrivals per day before price thinning, and the mix across the day:

| Site | Arrivals/day | Commuter / en-route / panic | Site adjustments | Turned away at the entrance (baseline) |
| :-- | --: | :-- | :-- | --: |
| Junction 42 | ~430 | 45% / 39% / 16% | — | ~36% |
| Eastgate | ~200 | 76% / 17% / 7%, in two sharp commute spikes | patience ×0.8 (a commuter gives up after ~6½ min) | ~30% |
| Kesteven | ~126 | 27% / 60% / 13%, daytime only | patience ×1.5, urgency ×0.7: unhurried shoppers | ~44% |

The mix moves through the day: panic-heavy overnight, commuter-heavy at the commute peaks, en-route-heavy at midday. So the right price at 08:00 is not the right price at 13:00, and the measurement says that matters (§9, item 2).

## 5. How the cars charge

Charging is modelled by **energy, not duration**. Nothing decides in advance how long a car will stay (`systems/charging.ts`).

1. **At plug-in, the car's demand is fixed.** Target charge is the driver's own (§4), or your charging limit if lower. `requestedKwh = (target − arrival charge) × battery`. The price per kWh is fixed here too.
2. **Every minute, power is worked out again.** Each bay's ceiling is `min(charger kW, car's max kW) × taper(charge)`, where the taper is full power below 80% and 40% at or above it. The grid cap is then shared across the charging bays by your power policy, so a car's speed changes from minute to minute depending on who else is plugged in.
3. **Energy builds up minute by minute.** A minute that crosses 80% is split: full power up to the knee, tapered power after it (D47). Charge level, revenue and energy cost all update that minute.
4. **The car leaves the moment it has its kWh**, and the bay is free that same minute.
5. **If the bay faults**, the session ends there. The driver keeps (and has paid for) what they got and leaves.

**Typical uncontended session times** (60 kWh car):

| Driver, car and bay | Energy | Time |
| :-- | --: | --: |
| Commuter, 45→85%, 150 kW car on a 150 kW rapid | 24 kWh | ~11 min |
| …same car, stopped at 80% | 21 kWh | ~8 min |
| En-route, 25→90%, 150 kW car on a 150 kW rapid | 39 kWh | ~19 min |
| En-route, 25→100%, 250 kW car on a 350 kW ultra | 45 kWh | ~15 min |
| …same car with a 90% limit | 39 kWh | ~12 min |
| Panic, 7→70%, 100 kW car on a 150 kW rapid | 38 kWh | ~22 min |
| Commuter, 45→85%, on a Kesteven 22 kW AC post | 24 kWh | ~78 min |

The 80%+ stretch is where the time goes: the last 5% of the commuter's charge takes 3 of their 11 minutes. **That is what the charging limit trades against.** Charging is otherwise flat — no curve before 80% — by choice (D47), which keeps sessions short and the day's pace unchanged.

**Under a binding grid cap it takes longer.** Six busy bays at Junction 42 can want 1,000 kW or more against 650 kW, and equal share then gives each car around 110 kW.

**Which bay a driver gets (D50).** The free bay that charges their car fastest, `min(bay kW, car kW)`. On a tie, the smallest such bay, so a 100 kW car takes a 150 kW rapid and leaves the 350 kW bay for a car that can use it. The queue is first come, first served, and the driver at the front chooses the same way when bays free up. Nobody holds out for a better bay type.

## 6. The seven levers

| Lever | What it does | What it costs you | When it matters |
| :-- | :-- | :-- | :-- |
| **Price** (£0.45–£1.20/kWh) | More per kWh. Fewer arrivals, and fewer of those stay. *(The connection fee is £0 and hidden, D52.)* | Volume. Every drive-on costs trust, and drivers turned away by **price** cost extra (D45). | Always. **The strongest single lever**, and worth moving through the day (§9, item 2). |
| **Power policy** — equal share / fast-first / finish-soonest-first / manual | Decides who gets the grid when it runs short. Creates no kilowatts. | — | Only when the cap binds. Since D48 `queue_relief` serves no more drivers than equal share, but fewer give up in the queue. `fast_first` is a trap that starves marginal bays. Inert at Kesteven by design. |
| **Charging limit** (off / 90% / 75% / 50%, D49) | Stops cars early, so bays turn over faster. 90% trims the slowest stretch for en-route drivers filling up; 75% cuts almost everyone. **The only lever that raises the throughput ceiling under a binding cap** (D14). | kWh sold, so revenue. −0.1 trust for each driver cut short. | When the queue is the problem and energy is not the money. |
| **Maintenance level** — Repair upon request / Standard contract / Preventive contract. **You start with no contract (D63).** | Fault rate ×1.25 / ×1.0 / ×0.5, repair time ×1.2 / ×1.0 / ×0.7, and a contractor who repairs faults unasked after 30 / 15 min on the two contracts (D53). | £0 / £25 / £150 a day standing. Repairs £200; calling one out yourself on a contract £300 (D59). | Busy sites with heavy hardware. Loses money on a quiet site (Kesteven). |
| **Call out a repair** | Starts the repair now rather than waiting for the contractor. On reactive, nobody else will. | £200 on reactive; **£300 on a contract**, against the contractor's £200 (D59) | Every fault on reactive; on a contract, when 15–30 minutes of a lost bay is worth £100 — at a peak, or with several bays down. |
| **Open / close bays** | Takes capacity out of service. A busy bay closes when it next goes idle. A closed bay costs nothing to run and can't fault (D54). | Capacity | Small savings on a quiet site or overnight (at most ~£50 a day per bay on the corridor). |
| **Upgrade a charger** (rapid 150 kW → ultra-rapid 350 kW for £75,000; at Kesteven also AC 22 kW → rapid for £35,000) | More power per bay, used only by cars faster than 150 kW (D50 sends them there) | Out of £100,000 starting cash. Comes out of cash, **not** the margin goal; it is judged by `margin_trap` instead. | Mostly a trap: it buys nothing at peaks, where the grid, not the charger, is the limit (Scenario §5a). |

## 7. What you are scored on, and what pushes back

**Three goals, checked at midnight** (D44): cumulative operating margin, all-day average wait, and end-of-day trust. Each site's goals are set so that changing nothing fails at least one goal on ≥80% of seeds (D13); the current values are from D57.

**Margin** = kWh × price − energy at £0.28/kWh − maintenance − site running costs (running costs and the standing maintenance charge scale with the bays you keep open, D54).

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

**Five failure states** are detected and logged but never end the day (D41). Each one is the shape of a classic mistake, and since D48 none of them is reached by competent play:

| State | Roughly | Typical cause |
| :-- | :-- | :-- |
| `queue_collapse` | A car queued for every two bays, a third walking away, for 30 min (D58) | Price cut |
| `power_choke` | Grid ≥95% drawn with 3+ queued, for 30 min | Price cut floods the forecourt |
| `reliability_spiral` | Uptime <85% with 3+ bays down, for an hour | Faults left unrepaired on reactive |
| `margin_trap` | You spent capital and met no more goals than doing nothing would have (judged against the same-seed baseline at close) | Early £75k upgrade |
| `trust_crash` | Trust below 40 and falling | Underpricing |

## 8. The three sites

The same rules on three different sites. Gate criterion 2 needs the right answer to change between them.

| | **Junction 42 Services** (corridor) | **Eastgate Park & Charge** (commuter) | **Kesteven Garden Centre** (destination) |
| :-- | :-- | :-- | :-- |
| Hardware | 4 × 150 kW + 2 × 350 kW | 6 × 150 kW | 7 × 22 kW AC + 1 × 150 kW |
| Grid cap | 650 kW (50% of nameplate) | 450 kW | 350 kW |
| Starting price / reference | £0.79 / £0.79 | £0.72 / £0.72 | £0.55 / £0.62 |
| Detour to next charger | 8–30 min (captive) | 2–7 min (competitive) | 5–18 min |
| Drivers | Mixed, panic overnight, high volume | Commuter-heavy, less patient (×0.8) | Patient (×1.5), less urgent |
| Goals: margin / wait / trust (D57, D59) | £4,000 / 3.5 min / 55 | £1,450 / 2 min / 70 | £450 / 3.3 min / 63 |
| What it teaches | You have pricing power, so use it; every goal bites | You have no pricing power; margin and trust are the hard goals | Ships underpriced; maintenance alone doesn't pay here |
| Best strategy measured (40–80 seeds) | premium + preventive (wave-pricing level) | preventive (wave-pricing level) | premium (wave-pricing level) |

The day's shape on the corridor: a sparse, panic-heavy night, then the morning commute, a lull, a midday en-route surge with **the scripted fault on the 350 kW bay 5 at 12:30**, a recovery window, then the evening peak, the hardest stretch of the day.

## 9. Where the core mechanic is strong, and where it is thin

Observations from the code and the measured findings, offered as the agenda for the playtest, not as verdicts. Updated for D46–D58.

**Strong:**

- **Every lever has a mechanism and a cost**, and since D47 the charging limit works the way it does on a real site: it cuts the slow stretch above 80%.
- **Playing the day is rewarded (D55).** A strategy that only moves price with the demand waves is the best measured at Eastgate and close to the best elsewhere, without touching maintenance. The game is not only a configuration puzzle.
- **Each failure state is a recognisable mistake**, and none is reached by competent play.
- **The price decision depends on the site** (D42/D43): the same rise earns money on the corridor and loses it at Eastgate.

**Thin, or not yet tested:**

1. **Price carries most of the game.** It controls congestion, margin and (through rejections) trust all at once. Power policy now only changes how many give up in the queue, the upgrade is a designed trap, and closing bays saves little.
2. **A simple pricing rule is near-best everywhere (D61, D62).** "Price up at the peaks, down in the lulls" can't be ruled out at any site, but it is the best at none: a different strategy wins each site. D62 counts that as an all-rounder rather than a dominant strategy, so criterion 2 passes narrowly. It is also the skill the game should teach, and a manual one (about 8 changes a day). The playtest will show whether players find it, and whether it feels like a skill or a solved puzzle.
3. **Two of the three goals get easier as you serve fewer people.** An empty forecourt has a perfect average wait (D44). With waits now short, this decided Eastgate: the first goal fit failed criterion 2 because of it, and the passing fit sets the wait goal where the baseline always meets it (D57). The verdict is a claim about goal values as much as mechanics.
4. **Maintenance is close to dominant.** `preventive` is part of every site's best strategy, and contractor repairs (D53) now make the higher tiers more convenient as well as more reliable.
5. **Calling out a repair is now a judgement, not a reflex (D59).** On a contract it costs £300 against the contractor's £200, so it pays only when 15–30 minutes of a lost bay is worth £100. Whether players read it that way is a playtest question.
6. **Trust responds slowly.** Capped at ±5 an hour and spread over many small events, its cause and effect may be hard to read within a five-minute day. That is gate criterion 1's question.
7. **Overload now shows at the entrance, not in the queue.** About a third of drivers turn away at the corridor and Eastgate under baseline play, and 44% at Kesteven, where unhurried drivers meet slow posts. Since D60 the **Served · turned away** card shows the count, the 15-minute share and the reasons (price, wait, queue full). Whether players connect it to their price is a playtest question.
8. **Sessions are probably short.** Flat charging below 80% gives DC sessions of about 8–22 minutes. Real UK rapid sessions are believed to run nearer half an hour, mostly because of the charging curve. *Not checked against a source.* Kept flat by choice (D47) to keep the day's pace; a realistic curve is a Phase 5 option and would mean rescaling demand.
9. **No overheads and no overstay.** No plug-in time, no losses, and a bay frees the minute a car finishes. Bay-blocking and idle fees are a real operator lever the game doesn't have.
10. **Driver types are the same on every site** apart from the mix, the detour range and the patience and urgency multipliers. A Kesteven shopper arrives as empty as a motorway driver.

## 10. Where the documents and the code disagree

D56 brought the scenario spec, Architecture §6 and the KPI dictionary back in line with the code on 2026-11-13. Known remaining gaps:

| Document | Status |
| :-- | :-- |
| `docs/model-map.html` | Regenerated for D46–D60 on 2026-11-13. |
| `Phase1_Findings.md`, `Phase3_Findings.md` | Historical records of earlier models; read them as dated. |
| `Session_Pack.md`, `Playtest_Protocol.md` | Not reviewed for D46–D58; check any numbers quoted to testers before the first session. |
