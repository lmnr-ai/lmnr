import { type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useEffect, useState } from "react";

const SETTLE_MS = 2000;
const USER_INPUT = ["wheel", "pointerdown", "keydown", "touchstart"] as const;

type ListVirtualizer = Virtualizer<HTMLDivElement, Element>;

export const alignRow = (virtualizer: ListVirtualizer, index: number) => {
  const target = virtualizer.getOffsetForIndex(index, "start")?.[0];
  const el = virtualizer.scrollElement;
  if (target !== undefined && el && Math.abs(el.scrollTop - target) > 1) virtualizer.scrollToOffset(target);
};

/**
 * Holds row `index` at the top while the rows around it measure in, then lets go after SETTLE_MS or on any user
 * input. `onChange` goes to `useVirtualizer`: it runs right after each measurement, before paint, so no frame shows
 * the row out of place. While `holding`, the virtualizer's own size-change corrections must be off: they compare
 * against a scroll offset that lags the jump by a frame, and stacked on this one they flung the list ~800px.
 */
export const useScrollToRow = (scrollRef: RefObject<HTMLDivElement | null>, index: number) => {
  const [holding, setHolding] = useState(index >= 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!holding || !el) return;
    const release = () => setHolding(false);
    const timer = setTimeout(release, SETTLE_MS);
    USER_INPUT.forEach((event) => el.addEventListener(event, release, { passive: true }));
    return () => {
      clearTimeout(timer);
      USER_INPUT.forEach((event) => el.removeEventListener(event, release));
    };
  }, [holding, scrollRef]);

  const onChange = useCallback(
    (virtualizer: ListVirtualizer) => {
      if (holding) alignRow(virtualizer, index);
    },
    [holding, index]
  );

  return { holding, onChange };
};
