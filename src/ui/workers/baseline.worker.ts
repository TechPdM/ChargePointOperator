/**
 * The end-of-day baseline, off the main thread.
 *
 * `runBaselineFor` is a full 1,440-tick simulation — measured at ~1.8s on the
 * roadside hub, and it grows with the vehicle population. It used to run inside
 * the store's reducer, so the dashboard froze for seconds at the exact moment
 * the day closed and the player was waiting to read their score. Nothing in it
 * touches the DOM, so it runs here instead.
 *
 * Only plain data crosses the boundary: the scenario goes over as an id and is
 * looked up on this side, because a `ScenarioConfig` is shared module state and
 * there is no reason to clone one per run.
 */

import { compareRuns, runBaselineFor } from "../../game/experiment/compareRuns.ts";
import { findScenario } from "../../game/scenarios/index.ts";
import type { Comparison, RunSummary } from "../../game/experiment/compareRuns.ts";

export interface BaselineRequest {
  /** Which run asked. A reply for a superseded run is dropped (see the store). */
  runSeq: number;
  scenarioId: string;
  seed: string;
  played: RunSummary;
}

export interface BaselineResponse {
  runSeq: number;
  comparison: Comparison;
}

// `tsconfig.lib` is DOM rather than WebWorker — the two conflict and the rest of
// the app needs DOM — so `self` types as a `Window` here and its `postMessage`
// has the wrong shape. Narrow it to the two members this file actually uses.
const ctx = self as unknown as {
  postMessage: (message: BaselineResponse) => void;
  addEventListener: (
    type: "message",
    handler: (event: MessageEvent<BaselineRequest>) => void,
  ) => void;
};

ctx.addEventListener("message", (event) => {
  const { runSeq, scenarioId, seed, played } = event.data;
  const comparison = compareRuns(played, runBaselineFor(findScenario(scenarioId), seed));
  ctx.postMessage({ runSeq, comparison });
});
