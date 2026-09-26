import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SOURCES, type SourceId } from "../lib/sources";

export interface TipContent {
  title: string;
  /** What the figure is and how it's worked out. */
  body: ReactNode;
  sources?: SourceId[];
}

/**
 * A figure or label with an explanation. Hover or focus shows it; a tap or
 * click pins it open (so touch screens work and links inside can be followed).
 */
export function Tip({ children, tip, className }: { children: ReactNode; tip: TipContent; className?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    if (pinned) return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  // Place the popover under the trigger (or above if there's no room), inside the viewport.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !pop.current) return;
    const r = trigger.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const margin = 12;
    let left = r.left + r.width / 2 - p.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));
    let top = r.bottom + 8;
    if (top + p.height > window.innerHeight - margin && r.top - p.height - 8 > margin) top = r.top - p.height - 8;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !pop.current?.contains(t)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onScroll = () => {
      setOpen(false);
      setPinned(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`tip-trigger ${className ?? ""}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={(e) => {
          if (!pop.current?.contains(e.relatedTarget as Node)) hideSoon();
        }}
        onClick={() => {
          // First click pins it open; a second click closes it.
          setPinned(!pinned);
          setOpen(!pinned);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="tooltip"
            className="tip-pop"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
          >
            <div className="tip-title">{tip.title}</div>
            <div className="tip-body">{tip.body}</div>
            {tip.sources && tip.sources.length > 0 && (
              <ul className="tip-sources">
                {tip.sources.map((s) => (
                  <li key={s}>
                    <a href={SOURCES[s].url} target="_blank" rel="noreferrer">
                      {SOURCES[s].publisher}: {SOURCES[s].title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
