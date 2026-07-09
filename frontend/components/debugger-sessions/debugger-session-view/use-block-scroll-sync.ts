import { type Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { type StoreApi } from "zustand";

import { type DebuggerFlatRow } from "./debugger-list/flat-rows";
import { type DebuggerSessionViewStore } from "./store";

// Active block = last row starting above this fraction of the viewport height.
const ACTIVE_BAND_RATIO = 0.15;

interface BlockScrollSyncArgs {
  scrollEl: HTMLElement | null;
  virtualizer: Virtualizer<HTMLElement, Element>;
  flatRows: readonly DebuggerFlatRow[];
  // First flat-row index for each block id (the scroll target).
  blockFirstIndex: Map<string, number>;
  storeApi: StoreApi<DebuggerSessionViewStore>;
}

/**
 * Two-way sync between the timeline scroll and the outline's active block.
 *  - scroll → outline: report the block at the top of the viewport.
 *  - outline click → scroll: pin the outline to the clicked block and jump it to
 *    the top. The pin holds until the user scrolls themselves, so the outline
 *    doesn't flicker through intermediate blocks while the programmatic scroll
 *    travels there (the virtualizer settles over several frames for lazy targets).
 */
export function useBlockScrollSync({
  scrollEl,
  virtualizer,
  flatRows,
  blockFirstIndex,
  storeApi,
}: BlockScrollSyncArgs) {
  const virtualizerRef = useRef(virtualizer);
  const flatRowsRef = useRef(flatRows);
  const blockFirstIndexRef = useRef(blockFirstIndex);
  useEffect(() => {
    virtualizerRef.current = virtualizer;
    flatRowsRef.current = flatRows;
    blockFirstIndexRef.current = blockFirstIndex;
  });

  // While pinned, the scroll tracker is paused so the outline stays on the clicked
  // block. Released by the next genuine user scroll gesture (wheel / touch).
  const pinnedRef = useRef(false);

  // scroll → outline. Scan only the visible window (cheap), not the whole
  // measurements cache (one entry per span, large in long sessions).
  useEffect(() => {
    if (!scrollEl) return;
    let rafId: number | null = null;
    const update = () => {
      rafId = null;
      if (pinnedRef.current) return;
      const band = scrollEl.scrollTop + scrollEl.clientHeight * ACTIVE_BAND_RATIO;
      const items = virtualizerRef.current.getVirtualItems();
      let activeIndex = items[0]?.index ?? -1;
      for (const item of items) {
        if (item.start > band) break;
        activeIndex = item.index;
      }
      const active = activeIndex >= 0 ? (flatRowsRef.current[activeIndex]?.blockId ?? null) : null;
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

  // A genuine user input gesture releases the pin so the outline follows again.
  // Covers wheel/touch (gesture), pointerdown (scrollbar drag / content click), and
  // keydown (arrows / PageUp-Down / Space / Home / End, bubbling from a focused
  // descendant). All are user-initiated, so unlike a bare 'scroll' listener they
  // never fire during the programmatic outline-click scroll or its lazy-target settle.
  useEffect(() => {
    if (!scrollEl) return;
    const release = () => {
      pinnedRef.current = false;
    };
    scrollEl.addEventListener("wheel", release, { passive: true });
    scrollEl.addEventListener("touchstart", release, { passive: true });
    scrollEl.addEventListener("pointerdown", release, { passive: true });
    scrollEl.addEventListener("keydown", release);
    return () => {
      scrollEl.removeEventListener("wheel", release);
      scrollEl.removeEventListener("touchstart", release);
      scrollEl.removeEventListener("pointerdown", release);
      scrollEl.removeEventListener("keydown", release);
    };
  }, [scrollEl]);

  // outline click → scroll. `scrollToIndex` is instant (the virtualizer's scrollToFn
  // writes scrollTop directly); the rAF second pass corrects the offset once the
  // target's real height is measured. Runs off a store subscription, not an effect
  // keyed on scrollToBlockId (whose consume would re-run the effect).
  useEffect(() => {
    if (!scrollEl) return;
    let rafId: number | null = null;
    const handle = (blockId: string) => {
      storeApi.getState().consumeScrollToBlock();
      const idx = blockFirstIndexRef.current.get(blockId);
      if (idx === undefined) return;
      pinnedRef.current = true;
      virtualizerRef.current.scrollToIndex(idx, { align: "start" });
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => virtualizerRef.current.scrollToIndex(idx, { align: "start" }));
    };
    const unsub = storeApi.subscribe((s, prev) => {
      if (s.scrollToBlockId && s.scrollToBlockId !== prev.scrollToBlockId) handle(s.scrollToBlockId);
    });
    const pending = storeApi.getState().scrollToBlockId;
    if (pending) handle(pending);
    return () => {
      unsub();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scrollEl, storeApi]);
}
