import type { ReactNode, ReactElement } from "react";

/**
 * The instrument-panel frame. Every panel has a small letterspaced label and
 * optional right-aligned hint; nothing else is chrome.
 */
export function Panel({
  title,
  hint,
  tone,
  children,
  wide,
}: {
  title: string;
  hint?: ReactNode;
  tone?: "ok" | "warn" | "bad";
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  return (
    <section className={`panel ${tone ? `panel-${tone}` : ""} ${wide ? "panel-wide" : ""}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        {hint ? <span className="panel-hint">{hint}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Shown wherever a table or feed has nothing in it. An empty state directs. */
export function Empty({ children }: { children: ReactNode }): ReactElement {
  return <p className="empty">{children}</p>;
}
