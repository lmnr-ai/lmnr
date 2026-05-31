"use client";

import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

interface Props {
  headings: TocItem[];
  className?: string;
}

// Single persistent indicator, not per-row layoutId. layoutId blinks when the
// active jumps from a lower row to a higher one: the new motion.div mounts
// inside a row whose flex items-stretch height hasn't resolved yet, Framer
// reads a ~0px rect, animates from there → "collapses to 0, expands". Lifting
// the indicator out and animating top/height on a stable element removes the
// race — same DOM node, same parent, just two changing numbers.
export default function TableOfContents({ headings, className }: Props) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.anchor ?? null);
  const rowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const targets = headings
      .map((h) => document.getElementById(h.anchor))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Top-of-viewport detector, not "active band". A heading is active the
        // frame it crosses INTO the top 15% of the viewport — including when a
        // TOC anchor click parks it at viewport top. The previous "active band"
        // rootMargin missed click-landings because the heading ended up above
        // the band entirely.
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: "0px 0px -85% 0px" }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [headings]);

  // End-of-document fallback: if the doc can't scroll far enough to bring the
  // last heading into the top 15% band, the observer never fires for it. When
  // the user reaches the bottom, force-activate the last heading.
  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = headings[headings.length - 1];
        if (last) setActiveId(last.anchor);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);

  // Synchronous post-layout measurement of the active row — useLayoutEffect
  // (not useEffect) so the indicator's first paint already has the right
  // top/height. Recomputes if the row's height ever changes (responsive
  // text reflow on resize). Also nudges the row into view inside the
  // scrollable nav — `block: "nearest"` is a no-op when the row is already
  // visible, so calm scrolling doesn't get re-scrolled out from under the
  // user. CSS handles the scrollability (overflow-y-auto + max-h); JS only
  // handles the "follow the active row" behavior because CSS has no
  // mechanism for that.
  useLayoutEffect(() => {
    if (!activeId) return;
    const el = rowRefs.current.get(activeId);
    if (!el) return;
    setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, headings]);

  if (headings.length === 0) return null;

  return (
    <nav className={cn("overflow-y-auto thin-scrollbar", className)}>
      {/* Inner relative wrapper — this is the containing block for the track
          and the indicator. Crucially, it lives INSIDE the scroll port (the
          nav), so its height = sum of row heights = full scroll content
          height. If the track were absolute on the nav itself, its
          containing block would be the nav's *padding box* (visible area
          only), and the line would stop at the bottom of the viewport
          instead of extending through the scrollable region. */}
      <div className="relative flex flex-col">
        {/* Continuous muted track — spans the full scroll content height. */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-landing-surface-500" />

        {/* Highlight — animates between row positions. Initial mount uses
            `initial={false}` so the very first frame snaps to the measured
            position instead of tweening in from origin. */}
        {indicator && (
          <motion.div
            className="absolute left-0 w-px bg-white"
            initial={false}
            animate={{ top: indicator.top, height: indicator.height }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}

        {headings.map((h) => {
          const isActive = activeId === h.anchor;
          return (
            <a
              key={h.anchor}
              ref={(el) => {
                if (el) rowRefs.current.set(h.anchor, el);
                else rowRefs.current.delete(h.anchor);
              }}
              href={`#${h.anchor}`}
              className="flex flex-row items-stretch gap-3 scroll-my-5 no-underline group"
            >
              {/* Spacer — same width as the track so the label aligns with
                  the layout. The actual line is rendered as a single
                  continuous element above. */}
              <div className="w-px shrink-0" />
              <span
                className={cn(
                  "py-[5px] text-sm leading-snug transition-colors",
                  h.level === 1 && "pl-2",
                  h.level === 2 && "pl-5",
                  h.level >= 3 && "pl-8",
                  isActive ? "text-white" : "text-landing-text-300 group-hover:text-landing-text-100"
                )}
              >
                {h.text}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
