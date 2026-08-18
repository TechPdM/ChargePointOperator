import { memo, useState } from "react";
import type { ReactElement } from "react";
import { simClock } from "../format.ts";
import { Empty } from "./Panel.tsx";
import type { ActionRecord, LoggedEvent } from "../hooks/useSimulation.ts";

/**
 * The event log and the action history, side by side under one tab strip.
 *
 * Phase 2's exit criterion asks for both to be visible; keeping them in one
 * place also makes the question the playtest asks — *what did you change, and
 * did it work?* — answerable by looking in a single spot.
 */
/**
 * Memoised on its two arrays, which the store already keeps identity-stable
 * (D41): the reducer returns the previous `events` when a tick emitted nothing
 * but a snapshot, and `actions` only changes when the player does something.
 * No prop narrowing needed — this one was re-rendering purely because its
 * parent did.
 */
function EventLogPanelImpl({
  events,
  actions,
}: {
  events: LoggedEvent[];
  actions: ActionRecord[];
}): ReactElement {
  const [tab, setTab] = useState<"events" | "actions">("events");
  const notable = events.filter((e) => e.level !== "debug");

  return (
    <section className="panel log-panel">
      <div className="panel-head">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "events"}
            className={tab === "events" ? "is-active" : ""}
            onClick={() => setTab("events")}
          >
            Site log
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "actions"}
            className={tab === "actions" ? "is-active" : ""}
            onClick={() => setTab("actions")}
          >
            What you changed
            {actions.length > 0 ? <span className="tab-count">{actions.length}</span> : null}
          </button>
        </div>
      </div>

      <div className="panel-body log-body">
        {tab === "events" ? (
          notable.length === 0 ? (
            <Empty>Nothing has happened yet.</Empty>
          ) : (
            <ul className="log-list">
              {[...notable].reverse().map((e) => (
                <li key={e.key} className={`log-${e.level}`}>
                  <span className="log-time mono">{simClock(e.sim_time_seconds)}</span>
                  <span className="log-message">{e.message}</span>
                </li>
              ))}
            </ul>
          )
        ) : actions.length === 0 ? (
          <Empty>You haven't changed anything yet. Poke something.</Empty>
        ) : (
          <ul className="log-list">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="log-time mono">{simClock(a.atSecond)}</span>
                <span className="log-message">
                  <b>{a.label}</b> — {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const EventLogPanel = memo(EventLogPanelImpl);
