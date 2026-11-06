import { ChevronDown, ChevronRight } from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useCollapsible } from "@/components/traces/span-view/collapsible";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";

const ExpandClamp = createContext<() => void>(() => {});

/** Lets a disclosure inside clamped content expand the clamp as it opens, so the opened part is never clipped. */
export const useExpandClamp = () => useContext(ExpandClamp);

interface HeightClampProps {
  maxHeight: number;
  defaultExpanded?: boolean;
  /** What the clamp stands for, e.g. its whole card: named by the sticky band, and scrolled to on collapse. */
  anchorRef: RefObject<HTMLElement | null>;
}

/** Clips long content to a preview, with a "Show more" row in the same style as the tool rows' disclosures. */
const HeightClamp = ({
  maxHeight,
  defaultExpanded = false,
  anchorRef,
  children,
}: PropsWithChildren<HeightClampProps>) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [open, setOpen] = useState(defaultExpanded);
  // Clipped content can't show its search matches.
  const searching = !!useSpanSearchState()?.searchTerm;
  const expanded = open || searching;
  // Clipped whether or not it overflows: content can grow after mount (editors render late), and a row that grew past
  // the clamp before re-clipping would shift everything below it under the virtualizer.
  const clamped = !expanded;

  // The content's own height, so it is re-checked when the content changes size even while clipped.
  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (el) setIsOverflowing(el.offsetHeight > maxHeight);
  }, [maxHeight]);

  // Layout effect: the toggle adds height, and it must land before paint. Added a frame later, a card scrolled in
  // from above grows under the virtualizer, which leaves that to the browser's scroll anchoring and eats the scroll.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    checkOverflow();
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [checkOverflow]);

  const collapse = useCallback(() => setOpen(false), []);
  const expand = useCallback(() => setOpen(true), []);
  // The sticky band folds it while "Show less" is out of view.
  useCollapsible(anchorRef, open && isOverflowing && !searching, undefined, "Show less", collapse);

  const toggle = () => {
    setOpen(!expanded);
    // Collapsing from deep inside long content would leave the view past its end.
    if (expanded) requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div>
      <div className="relative overflow-hidden" style={clamped ? { maxHeight } : undefined}>
        <div ref={contentRef}>
          <ExpandClamp value={expand}>{children}</ExpandClamp>
        </div>
        {clamped && isOverflowing && (
          <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none bg-linear-to-b from-surface/0 to-surface" />
        )}
      </div>
      {isOverflowing && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 border-t text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};

export default HeightClamp;
