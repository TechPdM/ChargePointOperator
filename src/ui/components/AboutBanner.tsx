import { useState, type ReactElement } from "react";

/*
 * What this is, said once, before anyone reads the numbers as real. Closing it
 * is remembered per browser; if storage is unavailable (private mode, blocked
 * site data) it simply shows again next visit, which is the safe failure.
 */
const STORAGE_KEY = "cpo.aboutBanner.dismissed.v1";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AboutBanner(): ReactElement | null {
  const [open, setOpen] = useState(() => !wasDismissed());
  if (!open) return null;

  const close = (): void => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Not remembered — it will show again next time. Nothing else depends on it.
    }
  };

  return (
    <aside className="about-banner" aria-label="About this app">
      <svg className="about-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5 1.5 21h21L12 2.5Z" fill="currentColor" />
        <path d="M12 9v5.5" stroke="var(--warn)" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="17.6" r="1.25" fill="var(--warn)" />
      </svg>
      <p>
        <strong>An attempt at a game, not a simulation.</strong> You run one EV charging site for a
        day — set the price, share out the power, open and close bays — and try to keep the queue
        moving without losing money. It's a work in progress: the numbers are tuned to make it
        playable, not drawn from real sites, so please don't read it as a realistic model of EV
        charging. Inspired by{" "}
        <a href="https://www.decisionproblem.com/paperclips/" target="_blank" rel="noopener noreferrer">
          Universal Paperclips
        </a>
        .
      </p>
      <button type="button" className="about-close" aria-label="Close this message" onClick={close}>
        ×
      </button>
    </aside>
  );
}
