import { useId, useState, type ReactNode, type ReactElement } from "react";

/**
 * The instrument-panel frame. Every panel has a small letterspaced label and
 * optional right-aligned hint; nothing else is chrome.
 *
 * `help` puts a small **?** after the title. Its copy shows on hover, on
 * keyboard focus, and on tap (touch has no hover); Escape or moving focus away
 * closes it. Fixed explanations live here rather than under the panel, so the
 * panels stay short (2026-11-15). Copy that changes during play stays inline.
 */
export function Panel({
  title,
  hint,
  help,
  tone,
  children,
  wide,
}: {
  title: string;
  hint?: ReactNode;
  help?: ReactNode;
  tone?: "ok" | "warn" | "bad";
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  return (
    <section className={`panel ${tone ? `panel-${tone}` : ""} ${wide ? "panel-wide" : ""}`}>
      <div className="panel-head">
        <div className="panel-title">
          <h2>{title}</h2>
          {help ? <PanelHelp title={title}>{help}</PanelHelp> : null}
        </div>
        {hint ? <span className="panel-hint">{hint}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function PanelHelp({ title, children }: { title: string; children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`panel-help ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="panel-help-btn"
        aria-label={`About ${title}`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        ?
      </button>
      <div role="tooltip" id={id} className="panel-help-pop">
        {children}
      </div>
    </div>
  );
}

/** Shown wherever a table or feed has nothing in it. An empty state directs. */
export function Empty({ children }: { children: ReactNode }): ReactElement {
  return <p className="empty">{children}</p>;
}
