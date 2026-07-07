import { type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect, useRef } from "react";
import { type StoreApi } from "zustand";

import { type DebuggerSessionViewStore, type SessionBlockView } from "./store";

// Active block = last one starting above this fraction of the viewport height.
const ACTIVE_BAND_RATIO = 0.15;
const MAX_FRAMES = 180;
const STABLE_FRAMES = 5;
// Native-feel ease-in-out over a fixed duration, then a gentle settle for late shifts.
const SCROLL_DURATION_MS = 450;
const SETTLE_EASE = 0.2;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface BlockScrollSyncArgs {
  scrollEl: HTMLElement | null;
  columnRef: RefObject<HTMLElement | null>;
  virtualizer: Virtualizer<HTMLElement, Element>;
  items: readonly { block: SessionBlockView }[];
  storeApi: StoreApi<DebuggerSessionViewStore>;
}

/**
 * Two-way sync between the timeline scroll and the outline's active block: a
 * scroll listener reports which block is active, and a click-driven loop scrolls
 * a requested block into view.
 */
export function useBlockScrollSync({ scrollEl, columnRef, virtualizer, items, storeApi }: BlockScrollSyncArgs) {
  // Mirror latest values into refs so the stable-dep effects below read them fresh.
  const virtualizerRef = useRef(virtualizer);
  const itemsRef = useRef(items);
  useEffect(() => {
    virtualizerRef.current = virtualizer;
    itemsRef.current = items;
  });

  // Report the active block from scroll position (virtualized-out rows unmount, no IO).
  useEffect(() => {
    if (!scrollEl) return;
    let rafId: number | null = null;
    const update = () => {
      rafId = null;
      // A click-driven scroll owns the active block until it settles.
      if (storeApi.getState().isNavigatingToBlock) return;
      const band = scrollEl.scrollTop + scrollEl.clientHeight * ACTIVE_BAND_RATIO;
      let active: string | null = null;
      for (const m of virtualizerRef.current.measurementsCache) {
        if (m.start > band) break;
        active = String(m.key);
      }
      storeApi.getState().setActiveBlockId(active);
    };
    const onScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(update);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scrollEl, storeApi]);

  // Chase a clicked block into view. Runs off a store subscription, not an effect
  // keyed on scrollToBlockId (whose consume would re-run and self-cancel the loop).
  useEffect(() => {
    if (!scrollEl) return;
    let stopActive: (() => void) | null = null;

    // Native smooth scroll can't chase: the target offset moves as lazy rows mount
    // and expanded traces re-measure, so we ease scrollTop toward its live position.
    const startLoop = (blockId: string) => {
      const idx = itemsRef.current.findIndex(({ block }) => block.id === blockId);
      if (idx === -1) return null;
      const prevBehavior = scrollEl.style.scrollBehavior;
      scrollEl.style.scrollBehavior = "auto";
      storeApi.getState().setNavigatingToBlock(true);
      const startTop = scrollEl.scrollTop;
      const startTime = performance.now();
      let frames = 0;
      let stable = 0;
      let rafId: number | null = null;
      let done = false;
      const stop = () => {
        if (done) return;
        done = true;
        storeApi.getState().setNavigatingToBlock(false);
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        scrollEl.removeEventListener("wheel", stop);
        scrollEl.removeEventListener("touchmove", stop);
        scrollEl.style.scrollBehavior = prevBehavior;
      };
      // scrollTop that puts the block's top at the viewport top, clamped to range.
      const targetOffset = (): number | null => {
        // :scope > — inner span virtualizers stamp data-index too.
        const cell = columnRef.current?.querySelector(`:scope > [data-index="${idx}"]`);
        const raw = cell
          ? scrollEl.scrollTop + (cell.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top)
          : virtualizerRef.current.getOffsetForIndex(idx, "start")?.[0];
        if (raw == null) return null;
        return Math.min(Math.max(raw, 0), scrollEl.scrollHeight - scrollEl.clientHeight);
      };
      const step = () => {
        const target = targetOffset();
        let atTarget = false;
        if (target != null) {
          const elapsed = performance.now() - startTime;
          if (elapsed < SCROLL_DURATION_MS) {
            // Ease-in-out from the start toward the live (moving) target.
            scrollEl.scrollTop = startTop + (target - startTop) * easeInOutCubic(elapsed / SCROLL_DURATION_MS);
          } else {
            // Animation done: gently settle any late target shift, then snap.
            const delta = target - scrollEl.scrollTop;
            if (Math.abs(delta) <= 1) {
              scrollEl.scrollTop = target;
              atTarget = true;
            } else {
              scrollEl.scrollTop += delta * SETTLE_EASE;
            }
          }
        }
        // Don't settle while rows load — their taller cards shift the target.
        const rowsLoading = Object.values(storeApi.getState().traceRowStates).some((s) => s === "loading");
        stable = atTarget && !rowsLoading ? stable + 1 : 0;
        frames += 1;
        if (stable >= STABLE_FRAMES || frames >= MAX_FRAMES) {
          stop();
          return;
        }
        rafId = requestAnimationFrame(step);
      };
      // A manual wheel/touch aborts — never fight the user's scroll.
      scrollEl.addEventListener("wheel", stop, { passive: true });
      scrollEl.addEventListener("touchmove", stop, { passive: true });
      rafId = requestAnimationFrame(step);
      return stop;
    };

    const handle = (blockId: string) => {
      stopActive?.();
      storeApi.getState().consumeScrollToBlock();
      stopActive = startLoop(blockId);
    };
    const unsub = storeApi.subscribe((s, prev) => {
      if (s.scrollToBlockId && s.scrollToBlockId !== prev.scrollToBlockId) handle(s.scrollToBlockId);
    });
    const pending = storeApi.getState().scrollToBlockId;
    if (pending) handle(pending);
    return () => {
      unsub();
      stopActive?.();
    };
  }, [scrollEl, columnRef, storeApi]);
}
