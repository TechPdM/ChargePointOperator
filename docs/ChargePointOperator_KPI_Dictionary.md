# ChargePointOperator — KPI Dictionary

**Version:** 1.7 · **Date:** 2026-11-15 *(**v1.7: D66 — trust recovers while below the start and no open bay is faulted, and each faulted bay left open drains it; D67 goals.** · **v1.6: D64 — a closed bay counts as closed whatever its state, so closing a faulted bay takes its fault out of uptime.** · **v1.5: D58 `queue_collapse` and `queue_overload` at pressure 0.5; D60 turned-away KPI and its funnel split.** · v1.1: cash/margin goal roles per D10 · v1.2: final-review fixes · v1.3: readiness-review fixes — utilization numerator, charge-start denominator, funnel buckets per D19, failure-state definitions per D24 · **v1.4: D31 — `queue_collapse` thresholds set from the measured joint distribution, and its abandonment arm reads the sustain window**)*
**Companions:** Architecture doc §5.3 (`SiteMetrics`), §7 (logging), §8 (dashboard)
**Purpose:** one precise definition per KPI — formula, denominator, window, units — shared by the sim, the logs, and the dashboard. This closes the gap the paired-schema rule (C6) doesn't cover: it checks that names *match*, not that they *mean the same thing*. Any change to a definition here is a schema change and travels with the C6 pair.

**Window types:**

- **INST** — instantaneous, read from current state.
- **ROLL** — rolling window over the last **900 sim-seconds (15 sim-min)**, computed from snapshots/events. The default for "how are we doing *now*" readouts.
- **CUM** — cumulative since scenario start. The default for goals and end-of-run scoring.

Dashboard KPI cards show **ROLL** value with **CUM** in the hover detail unless stated otherwise. Sim stores fractions; logs and UI show `_pct` (C6).

---

## Core KPIs

### Cash — `INST`
`economics.cash`. Updated per tick: `Δcash = revenue − energyCost − maintenanceCost − opexAccrual − capex` (must reconcile — invariant 6). Units: £. **Not a win goal (D10):** with a realistic £50k starting float, cash only matters as the bankruptcy fail condition (< £0); the scored economic goal is operating margin.

### Trust — `INST`
`metrics.trust`, 0–100, start 60. Moves only by the deltas in Calibration §5, clamped to ±5 per sim-hour. Not derived — it *is* state. Goal basis: end-of-run value. **D66:** below 60, and with no open bay faulted, it recovers a quarter of the gap each sim-hour; each faulted bay left open costs 2 per sim-hour until it is repaired or closed. So a bad patch heals once dealt with, and a site left broken crashes.

### Uptime — `ROLL` (card) / `CUM` (goal)
**Definition:** fraction of *open, serviceable* bay-time actually available to charge.

```
uptime = 1 − (downtimeFaultSeconds + downtimeRepairSeconds) / openBaySeconds
```

- **Denominator `openBaySeconds`** = Σ over bays of time with `isOpen == true`. Player-closed time (`downtimeClosedSeconds`) is **excluded from the denominator** — closing a bay is a capacity decision, not unreliability, and must not be a trick to inflate uptime. It's tracked and displayed separately (O3). **D64:** a bay counts as closed whenever `isOpen` is false, whatever its state; a faulted bay the player closes (possible at once on *Repair upon request*) stops counting against uptime until it reopens. That is a deliberate exception to the no-trick rule: the price is the bay's capacity, and the fault is still there when it reopens.
- Numerator components per O3: `downtimeFaultSeconds` (faulted, awaiting repair) + `downtimeRepairSeconds` (actively repairing).
- Edge case: a fault during an active session counts its remaining scheduled session time as fault downtime *and* marks the session interrupted.

### Utilization — `ROLL`
**Definition:** occupied fraction of available capacity, **bay-time based**:

```
utilization = occupiedBaySeconds / (openBaySeconds − faultSeconds − repairSeconds)
```

**v1.3 fix:** the numerator was written `chargingBaySeconds` while the sentence below it said `allocated` counts as occupied — the formula and its own gloss disagreed. `occupiedBaySeconds` = time in `charging` **or** `allocated`; it is an accumulator on `SiteMetrics`. `allocated` (plugged in, not yet drawing) counts as occupied. Note this is *not* power-based — a bay trickling 10 kW is 100% utilized. **Power utilization** is the separate secondary metric:

```
powerUtilization = kwhDelivered / (gridPowerKw × windowHours)
```

shown on `PowerLoadChart`, not the KPI strip. Conflating these two was an easy drift the discussion never guarded against; don't.

### Average wait — `ROLL` (card) / `CUM` (goal)
**Definition:** mean of `chargingStartedAtSecond − queuedAtSecond` over sessions that **started** in the window. Vehicles that never queued (straight to a bay) count as wait 0. **Abandoners are excluded** — their pain is measured by abandonment rate, not here.

⚠ **Survivorship warning:** avg wait can *improve* because everyone impatient gave up. The dashboard must always render `AvgWaitCard` and `AbandonmentCard` adjacent, and the `DiagnosisPanel` treats "wait ↓ while abandonment ↑" as a degradation, not a win. This pairing is a binding UI rule, same status as the C2 explainability rule.

### Queue length — `INST`
`queue.length`. Derived companion **queue pressure** = `queueLength / totalOpenBayCount` (selector), used for alert thresholds so 4-waiting means something different at 6 bays vs 2.

### Abandonment rate — `ROLL` (card) / `CUM` (goal)

```
abandonmentRate = queueAbandons / (queueAbandons + sessionsStarted)
```

Window-scoped counts. **`reject_site` and `site_full` (never joined the queue) are excluded** — that's demand shaping (often deliberate, e.g. via price) or a capacity wall, not queue failure. Both appear in the demand funnel (below), not here. `scenario_end` leavers are excluded from both numerator and denominator (D18).

⚠ **Two different "share of drivers we lost" numbers appear on screen** — this one, and `1 − chargeStartSuccessRate` below. They have different denominators on purpose: abandonment rate measures *committed* demand lost (people who joined the queue, plus everyone who got served), while charge-start success measures the whole accepted funnel. They will not match, and a tester noticing that is a legitimate legibility question, not a bug. Tooltips must say which is which.

### Turned away — `ROLL` (tone) / `CUM` (count) — *NEW (D60)*

```
turnedAwayRate  = turnedAway / arrivals                    // ROLL, last 900 s
turnedAwayToday = rejected_site + site_full                // CUM
rejected_site   = rejectedOnPrice + rejectedOnWait         // exactly
```

Drivers who looked at the site and left without queueing. Since D48 this is where overload shows, because drivers no longer join a queue as long as the bays; a falling average wait with a rising figure here means the forecourt emptied itself at the gate. **Reason attribution:** `rejectedOnPrice` if the driver was over their hard price ceiling, or if the price term in their `siteScore` outweighed the wait term; otherwise `rejectedOnWait`. `site_full` is reported separately. Shown on the **Served · turned away** card: the count is reported without judgement (D44), and the tone (amber ≥35%, red ≥55%) is on the ROLL rate, because every drive-on is a reputation event (D45). Not a goal.

### Sessions completed — `CUM`
Count of sessions with `completed == true`. Reported, not scored since D44.

### Session success rate — `CUM` — *(O2)*

```
sessionSuccessRate = sessionsCompletedWithoutFault / (completed + interruptedByFault)
```

The denominator is sessions that have **concluded**, not sessions started. A car still plugged in has neither completed nor faulted, and putting it in the denominator makes the rate read as a failure rate for in-flight work — measured at 85% mid-morning on a day with zero faults. Every session concludes one way or the other under the end-of-run sweep (D18), so this is identical to `sessionsStarted` at midnight; the scored and logged end-of-day figure is unaffected.

A fault-interrupted session counts as started-and-failed even if the driver got most of their charge. Partial charge to the *policy* target (core site policy — D14) counts as success — meeting a lowered target is not a failure. Sessions finalized by the end-of-run sweep (D18) also count as completed, with partial delivery noted in the post-run summary.

### Charge start success rate — `CUM` — *(O2)*

```
chargeStartSuccess = sessionsStarted / (vehiclesAccepted − closedAtRunEnd)
```

where accepted = passed admission (didn't `reject_site`) and wasn't turned away by `site_full`. The gap between accepted and started is queue abandonment — this is the funnel view of the same event stream (see reconciliation below).

**v1.3 fixes.** (1) The denominator now subtracts `closedAtRunEnd`: vehicles still queueing at 24:00 were being counted as accepted-but-never-started, which quietly penalised the metric for the day ending (D18 excluded them from abandonment for exactly this reason and this formula was missed). (2) Architecture §5.3 previously glossed this metric as "started / assigned to a bay", which is degenerate — nothing can fail between assignment and start — and has been corrected to match this definition. **This dictionary is canonical for meaning; the paired-schema rule (C6) only checks that names match, not that they mean the same thing.**

### Energy delivered — `CUM`
Σ `deliveredKwh`. Units: kWh.

### Margin — `ROLL` (card) / `CUM` (goal)

```
margin = revenue − energyCost − maintenanceCost − opexAccrual
```

**Capex excluded** — an upgrade is an investment decision, not a period cost; it hits cash, not margin. (Otherwise every `upgrade_charger` looks like a margin disaster in the window it lands, which would train players away from the mechanic for the wrong reason.) `MarginCard` hover shows the split. **Goal basis (D10):** CUM margin is the scenario's economic win goal (`minOperatingMargin`) — this ruling is what makes realistic capex playable.

### Throughput — `ROLL`
`sessionsCompleted` in window, scaled to vehicles/sim-hour.

---

## The demand funnel (reconciliation)

Every arriving vehicle ends in exactly one bucket — this is the accounting identity the `DiagnosisPanel` and post-run summary are built on, and invariant 7 enforces the "exactly one" part:

```
arrivals = rejected_site + site_full + abandoned_queue + interrupted_by_fault
         + completed + closed_at_run_end
```

**v1.3 fix:** `site_full` was missing. It is a value in `QueueLeaveReason` and was unreachable until D20 added `scenario.maxQueueLength`; now that it can happen, it needs a bucket or the identity doesn't close.

`closed_at_run_end` (D18): at 24:00 an end-of-run sweep finalizes still-charging sessions as completed (partial delivery recorded) and marks still-queueing vehicles as left with reason `scenario_end` — excluded from the abandonment-rate numerator, since running out of day is not a service failure. After the sweep, every vehicle is in exactly one bucket, which is what invariant 7 enforces.

**Every bucket is a `QueueLeaveReason` value, and there is only one vocabulary for them** (Architecture §5.1). The logs previously carried a second, non-overlapping set (`patience_exceeded` / `price_reject`) via an `abandonment_reason` field; that field is deleted and `vehicle.departed` carries `leave_reason` instead.

| Funnel stage | Leave reason | Event (log) | KPI it feeds |
| :-- | :-- | :-- | :-- |
| Arrived | — | `vehicle.arrived` | arrival rate |
| Rejected site | `reject_site` | `vehicle.site_rejected` (carries `main_reason`, D60) → `vehicle.departed` | turned away (D60), split by price / wait; demand-shaping diagnostics (not abandonment) |
| Turned away, queue full | `site_full` | `vehicle.departed` | turned away (D60); capacity diagnostics |
| Joined queue | — | `vehicle.queue_joined` | queue length |
| Abandoned | `queue_abandon` | `vehicle.queue_abandoned` → `vehicle.departed` | abandonment rate, trust |
| Started | — | `session.started` | charge start success, avg wait |
| Interrupted by fault | `service_interrupted` *(D19)* | `session.interrupted` → `vehicle.departed` | session success (fail), trust |
| Completed | `completed` | `session.completed` → `vehicle.departed` | sessions completed, energy, margin |
| Closed at run end | `scenario_end` *(D18)* | `vehicle.departed` | post-run summary only; excluded from abandonment |

*(D19 note: fault-interrupted vehicles previously had no legal terminal state and no leave reason at all — the vehicle state machine's only exit from `[CHARGING]` was `[COMPLETE]`. This row was an accounting bucket with nothing able to enter it.)*

---

## Failure states — `NEW (D24)`

Gate criterion 3 requires "≥4 of 5 failure states observed arising naturally across all runs." The five were named in the plan and defined nowhere, which made the criterion unscoreable — you cannot count what you cannot detect. These are **detection rules, not fail conditions**: they do not end the run (the only hard fails are in `ScenarioConfig.failRules`). They emit `failure_state.entered` / `failure_state.cleared`, accumulate into `RunManifest.failure_states_observed`, and drive the `DiagnosisPanel`.

| State | Enters when | Clears when | Reads as |
| :-- | :-- | :-- | :-- |
| `queue_collapse` *(D31, D58)* | queue pressure ≥ **0.5** *(D58; was 1.0)* **and** abandonment ≥ 30% **measured over the 1,800 s sustain window**, both holding ≥ 1,800 sim-s | queue pressure < **0.35** for 900 sim-s | "a car queued for every two bays you own, and a third of the people who committed walking away" |
| `power_choke` | Σ allocated ≥ 95% of `gridPowerKw` **and** queue length ≥ 3, sustained ≥ 1,800 sim-s | allocated < 85% for 900 sim-s | "the grid cap, not the bays, is the wall" |
| `reliability_spiral` | ROLL uptime < 85% for ≥ 3,600 sim-s, **or** ≥ 3 bays simultaneously `faulted`/`repairing` | ROLL uptime ≥ 90% for 900 sim-s | "the site is falling apart faster than it's fixed" |
| `margin_trap` | CUM capex > 0 **and** projected end-of-run goals-met count ≤ the same-seed baseline's | never clears within a run (evaluated at close-out) | "you spent £75k and it bought nothing" |
| `trust_crash` | trust < 40 **and** falling over the preceding 1,800 sim-s | trust ≥ 45 | "reputation is in a downward spiral" — distinct from the hard fail at < 30 for 7,200 s |

**Two things D31 changed, both from measurement rather than argument.** (1) The abandonment arm reads the **sustain window**, not the 900 s card window: over 900 s the rate swings between 0% and 50% every time a session starts, so a condition asked to hold for half an hour was being reset by its own measurement noise. (2) The pressure threshold came down from 2.0 — which with six bays and a queue capacity of 12 required the queue to be *exactly full* — to 1.0, chosen from the joint distribution: across 5 seeds the longest window in which both arms held was **0 ticks under baseline at every combination tried**, and **44 ticks at ≥1.0 / ≥30%** under a deliberate price cut. Entering a failure state also now tolerates a brief lapse (`FAILURE_ENTER_GRACE_SECONDS = 300`), for the same reason hysteresis exists on the clear side.

Two deliberate choices. **The dual conditions matter**: `power_choke` without the queue term fires every peak by design (the cap is *meant* to bind), and `queue_collapse` without the abandonment term fires whenever demand simply exceeds capacity. Both would make criterion 3 trivially satisfiable and therefore meaningless. And `margin_trap` needs the paired baseline run, so it is only evaluable in the baseline-comparison harness (O4) — which is one more reason that harness is MVP-core (D6) rather than a Phase 3 nicety.

---

## Alert thresholds (first guesses — tune with Calibration §7)

| Alert | Trigger | Clear |
| :-- | :-- | :-- |
| `queue_overload` | queue pressure > **0.5** for ≥ 300 sim-s *(D58; was 1.0)* | < **0.35** |
| `low_uptime` | uptime (ROLL) < 90% | ≥ 93% |
| `negative_margin` | margin (ROLL) < **−£25** for ≥ 900 sim-s | ≥ £0 |
| `power_saturation` | allocated ≥ 95% of `gridPowerKw` for ≥ 300 sim-s | < 85% |
| `trust_collapse` | trust < 40 | ≥ 45 |

Hysteresis (different raise/clear levels) is deliberate — flapping alerts destroy the legibility the whole design depends on. The `negative_margin` trigger is −£25 rather than £0 for the same reason: on the 24h day (D8), quiet overnight ROLL windows legitimately run a pound or two negative on opex accrual with near-zero demand — a £0 trigger would alarm all night about the sun being down.

---

## Computation notes

- ROLL metrics are computed from the event stream / snapshot history, **not** by mutating running averages in state — keeps the reducer pure and the numbers replayable (D4).
- `metric.snapshot` (every 300 sim-s — D9) emits every KPI above at both ROLL and CUM scope; charts read snapshots, cards read the latest snapshot + INST values.
- End-of-run scoring uses CUM values only, against `ScenarioGoals`.
- **Accumulators are state, rates are derived.** `openBaySeconds`, `occupiedBaySeconds`, the three downtime counters and the `DemandFunnel` counters live on `SiteMetrics` and only ever increment; every percentage above is computed from them. Storing a rate and storing its inputs is how the two drift apart.
- **The trust clamp is a rolling window.** "±5 per sim-hour" (Calibration §5) means a rolling 3,600 sim-second window, not a fixed hour bucket — bucket boundaries would let a 10-point swing through by straddling 59:59. Backed by `metrics.trustDeltaThisHour`. Clamping is *silent*: if it engages often, the underlying deltas are wrong, so Phase 3 sweeps should log clamp hits rather than let them absorb a mis-tune.
