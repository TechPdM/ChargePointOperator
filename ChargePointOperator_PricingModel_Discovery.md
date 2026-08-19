# ChargePointOperator — Pricing Model: Problem Discovery

**Status:** discovery complete, **nothing decided, nothing changed.** No code in this document has been written.
**Date:** 2026-08-19
**Prompted by:** a question about how the drivers-served goal works, which turned into a question about whether it should exist, which turned into this.
**Related:** D21 (admission), D36 (goals re-fitted, demand ×1.8), D38 (criterion 2 judged on separation), D41 (no hard fails). Gate criterion 2, Plan §6.2.

---

## 1. The question

> *"The realistic goal is the maximisation of revenue, the number of sessions is beside the point."*

A reasonable position, and the honest objective for a real operator. This document is what happened when it was tested rather than argued.

The short answer: **the current model cannot support profit as its only objective**, because profit maximisation collapses to a single price that is correct on every site and improves every other measure at the same time. The session goal was the only thing making price a decision rather than a lookup.

That is a finding about the demand model, not about the goal list. The rest of this document is the evidence and what could be done about it.

---

## 2. What was measured

All figures are headless, deterministic, baseline policy, roadside/commuter/destination as shipped. Sample sizes stated per result.

### 2.1 Price sweep — 8 price points × 12 seeds × 3 scenarios

| Site | List price | Revenue peaks | **Margin peaks** |
| :-- | --: | --: | --: |
| Junction 42 (corridor) | £0.79 | £0.85 | **£0.85** |
| Eastgate (commuter) | £0.72 | £0.75 | **£0.85** |
| Kesteven (destination) | £0.55 | £0.75 | **£0.85** |

**Margin peaks at £0.85 on all three archetypes.** A motorway services, an urban commuter car park and a garden centre all want to charge exactly the same. Under a profit objective the site type does not change the pricing decision.

Every site also ships **underpriced**: "put the price up" is correct on day one on all three, and Kesteven is the worst of the three — £0.55 against an £0.85 optimum, a third below it, needing a 55% rise to reach it.

### 2.2 There is no trade-off at the optimum

Junction 42, baseline, as price rises from the bottom of the range to the optimum:

| | £0.45 | £0.85 |
| :-- | --: | --: |
| Margin | £556 | **£3,981** |
| Trust | 14.6 | **59.1** |
| Average wait | 12.6 min | **4.1 min** |
| Sessions completed | 366 | 297 |

Margin, trust and wait **all improve together**. The only thing that falls is volume.

This directly contradicts the scenario spec's stated design intent — *"the goals still pull against each other"*. For the price lever that is false the moment session count stops being scored: one setting wins on everything being measured.

### 2.3 The mechanism is a cliff, not a demand curve

Between £0.85 and £0.95, Eastgate's completed sessions collapse **128 → 32**. That is not elasticity; it is the `commuter` archetype's `maxAcceptablePricePerKwh` of £0.95 taking effect, and commuters are the bulk of that site's mix.

Archetype ceilings (`calibration.ts`): **commuter £0.95 · en-route £1.10 · panic_low_soc £1.50.**

So the "skill" in pricing is finding the cliff edge — and **it is the same edge on every site**, because all three scenarios draw from the same three archetypes. Sites differ in demand volume, wave mix and elasticity, but not in what a driver will *pay*.

Wave elasticity does vary in the right direction (Kesteven 0.6–0.9 captive, Eastgate 0.8–1.4 elastic, Junction 42 0.7–1.2) but the spread is far too small to matter against a shared hard ceiling.

### 2.4 Profit-only scoring is solved — paired test, 20 seeds

Best strategy by margin per site, and which strategies cannot be ruled out against it:

| Site | Best by margin | Not separable |
| :-- | :-- | :-- |
| Junction 42 | `preventive` £4,121 | `premium+preventive` (*t*=1.42) |
| Eastgate | `premium+preventive` £1,179 | — clear of the field |
| Kesteven | `premium` £544 | `premium+preventive` (*t*=1.38) |

Three *different* argmax winners, which looks healthy. But **`premium+preventive` cannot be ruled out on any of the three** — it is statistically credible everywhere, which under D38 makes it a dominant strategy and **fails criterion 2**.

This is exactly the trap D38 was built to catch: distinct winners on paper, one universal answer underneath.

### 2.5 What the session goal was actually doing

Simulating the removal of `minSessionsCompleted` from scoring, without changing code:

- **D13 difficulty floor is unaffected** — 16/20 with four goals, 16/20 with three. **No seed failed only on sessions.** It was never what made a day hard.
- **Criterion 2 breaks** — `premium+preventive` becomes the argmax winner on all three sites.

So the goal is not decorative, despite being met on 19 of 20 baseline seeds. Its structural job is narrow and specific: it is **the only thing that rules `premium+preventive` out on the corridor** (222 sessions against a 300 target, where `preventive` gets 327).

Two of the remaining three goals — trust and average wait — **both improve when you serve fewer people**. Only the session count pulls the other way. The scorecard leans volume-averse and margin gets outvoted; that criticism of the current design is correct and is what prompted this.

---

## 3. Root cause

**The price ceiling is a property of the driver archetype, not of the situation.** Three constants, shared by all three scenarios, with zero variance.

Two consequences follow:

1. **No site can make premium pricing wrong,** because the ceiling that would punish it is identical everywhere.
2. **The refusal is a step, not a curve,** because every driver of an archetype flips at exactly the same price.

The zero-variance defect has precedent here twice already. D31 added noise to perceived wait because "perfect information made every arrival read the true wait and drive on". D33 recorded that fixed driver target SOC "should have real spread" as the better model, deferred to Phase 5. This is the third instance of the same shape.

### 3.1 There are already two price mechanisms

`admission.ts` applies both:

- **Soft** — `siteScore` weighs `priceSensitivity × (price − reference)` against urgency, wait and trust, continuously. Note it uses `ARCHETYPES[archetype].referencePricePerKwh`, **not** the site's own reference, which is a second reason sites cannot differentiate on price.
- **Hard** — `price > maxAcceptablePricePerKwh` is a binary veto that overrides the score entirely.

Any fix has to decide what the ceiling is *for*, given the soft model already prices.

---

## 4. Options

### Approach A — make the ceiling situational

Four factors, ordered by value against risk. They compose; they do not have to be taken together.

**A1. Per-driver spread.** Draw each vehicle's ceiling from a range instead of a constant, as `batteryCapacityKwh`, `maxChargeRateKw` and `urgency` already are. Turns the cliff into a demand curve and removes the find-the-exact-edge degeneracy. *Smallest change, strongest precedent, improves realism on its own merits.*

**A2. Site-level tolerance multiplier.** Scale the ceiling per scenario, exactly as `urgencyMultiplier` and `patienceMultiplier` already scale archetype constants at `createVehicle`. **This is the factor that produces site differentiation** and is the point of the exercise.

It should be **derived, not chosen**. The physical basis is *detour to the nearest alternative*: a motorway services 25 miles from the next rapid charger has genuine pricing power; an urban commuter hub with chargers on the next street and home charging as a fallback has almost none. Expressing the multiplier as a function of detour minutes makes it mean something. Without that, it is a free parameter tunable to produce any desired answer — the precise failure mode OPEN-3 and OPEN-7 established a discipline against.

**A3. State of charge.** At 8% a driver pays what is asked; at 60% they drive on. `currentSoc` exists at arrival. Note this is *already* present crudely — `panic_low_soc` carries both low arrival SOC and a £1.50 ceiling — so making it continuous mainly means a low-SOC **commuter** also pays more, which is right and currently missing.

**A4. Time of day.** Overnight the alternatives are shut and detouring is less attractive. The wave table already carries per-wave `priceElasticity`, so a per-wave tolerance factor fits the existing shape.

**Risk of stacking:** A2 and A3 can double-count. If low SOC raises tolerance *and* the corridor draws more panic arrivals, the corridor gains differentiation twice and the multiplier gets fitted to compensate for something already modelled.

### Approach B — remove the ceiling, make the soft model site-aware

Delete `maxAcceptablePricePerKwh`. Give `siteScore` a **site-level** price reference in place of the archetype one, plus per-driver spread on price sensitivity. One mechanism instead of two.

Cleaner, and removes a redundancy rather than adding parameters to it. But a larger behavioural change: the hard ceiling is currently what produces near-total refusal at £1.20 (roadside sessions fall to 35), and `siteScore`'s price coefficient would have to carry that alone. **Needs measurement before commitment.**

### Recommendation

**A1 + A2 first, measure, then decide.** If A3 and A4 turn out to be needed as well, the multipliers stacking up is itself the signal that B is the better shape.

---

## 5. Acceptance criteria

Stated before any tuning, so the work stays falsifiable:

1. **Margin peaks at materially different prices per site.** Currently £0.85 on all three; this is the whole point.
2. **Premium pricing is actively wrong somewhere** — at least one site where +15% loses money.
3. **Criterion 2 passes under D38's separation test**, ideally with more headroom than now — no strategy a contender on all three archetypes.
4. **D13 floor holds at ≥80%** on all three scenarios.
5. **Criterion 4 (decisions matter) still passes.**

---

## 6. Cost, stated plainly

This moves every calibrated number in the project.

- All four goals on three scenarios were fitted to the current demand model (D36). They will need re-fitting.
- The D13 floor sits at **exactly 80% with no headroom**, by D36's own warning: "a single seed flipping puts roadside under, so re-measure before trusting it after any further change."
- Criteria 2, 3 and 4 are all scored off this model.
- Calibration §7's measured table would need re-measuring for the third time in three days.

Expect a full recalibration pass, not a tuning tweak. It changes what a scenario means, so it wants a D-entry.

---

## 7. What we cannot lean on

An earlier draft of this reasoning justified keeping a session-count goal by appeal to real-world minimum-service obligations on public charging networks. **That claim was asserted without a source and should not be relied on.** The project explicitly scopes regulation out (`original_perplexity_discussion.md:553` lists "regulation systems" as out of scope), and there is no research in this repository supporting it.

What is plausibly true, and would need checking before use: UK obligations on charge point operators concern **availability** (the Public Charge Point Regulations 2023 and a network-level reliability requirement for rapid charging), not throughput. If a realistic non-profit obligation is ever wanted, **uptime has grounding that driver count does not** — and the game already tracks uptime without scoring it.

---

## 8. Decisions needed

1. **Approach A or B.**
2. **How the site multiplier is grounded** — derived from detour-to-alternative, or fitted from measured spreads in the manner of OPEN-7 and D36.
3. **Whether the session goal comes out** once price differentiates by site. It may no longer be load-bearing, at which point the original question resolves itself — but that is a measurement to take *after* the change, not an assumption to build on.

---

## 9. Status of the code

Unchanged. Everything above is measurement and proposal. The last committed change is `cdc5387` (D41, hard fail rules removed).
