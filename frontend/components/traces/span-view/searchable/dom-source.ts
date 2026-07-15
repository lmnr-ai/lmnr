import { findMatchOffsets, type MatchOffset } from "@/components/traces/span-view/searchable/find-matches";
import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

const MATCH_KEY = "span-search-match";
const ACTIVE_KEY = "span-search-active";

// lib.dom omits Highlight setlike methods.
type HighlightLike = {
  priority: number;
  add(range: AbstractRange): void;
  delete(range: AbstractRange): boolean;
};

type HighlightRegistryLike = {
  get(key: string): HighlightLike | undefined;
  set(key: string, value: HighlightLike): void;
};

function getHighlightRegistry(): HighlightRegistryLike | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") {
    return null;
  }
  return CSS.highlights as unknown as HighlightRegistryLike;
}

function getOrCreateHighlight(key: string, priority: number): HighlightLike | null {
  const registry = getHighlightRegistry();
  if (!registry) return null;

  let highlight = registry.get(key);
  if (!highlight) {
    highlight = new Highlight() as unknown as HighlightLike;
    highlight.priority = priority;
    registry.set(key, highlight);
  }
  return highlight;
}

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

function collectTextNodes(root: Node): TextNodeSpan[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeSpan[] = [];
  let pos = 0;
  let current: Node | null;

  while ((current = walker.nextNode())) {
    const text = current as Text;
    const len = text.length;
    if (len > 0) {
      nodes.push({ node: text, start: pos, end: pos + len });
      pos += len;
    }
  }

  return nodes;
}

function rangeFromOffset(textNodes: TextNodeSpan[], offset: MatchOffset): Range | null {
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const span of textNodes) {
    if (startNode === null && offset.start >= span.start && offset.start < span.end) {
      startNode = span.node;
      startOffset = offset.start - span.start;
    }
    if (offset.end > span.start && offset.end <= span.end) {
      endNode = span.node;
      endOffset = offset.end - span.start;
      break;
    }
  }

  if (startNode && !endNode && textNodes.length > 0) {
    const last = textNodes[textNodes.length - 1];
    if (offset.end === last.end) {
      endNode = last.node;
      endOffset = last.node.length;
    }
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function scrollRangeIntoView(range: Range) {
  const node = range.startContainer;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  el?.scrollIntoView({ block: "center", behavior: "instant" });
}

interface DomSearchSourceOptions {
  id: string;
  container: HTMLElement;
  messageIndex: number;
  contentPartIndex: number;
}

export function createDomSearchSource({
  id,
  container,
  messageIndex,
  contentPartIndex,
}: DomSearchSourceOptions): SearchableSource {
  let matchRanges: Range[] = [];
  let activeRange: Range | null = null;

  const removeRanges = (highlight: HighlightLike | null, ranges: Range[]) => {
    if (!highlight) return;
    for (const range of ranges) {
      highlight.delete(range);
    }
  };

  const clearMatches = () => {
    const matchHighlight = getOrCreateHighlight(MATCH_KEY, 0);
    const activeHighlight = getOrCreateHighlight(ACTIVE_KEY, 1);
    removeRanges(matchHighlight, matchRanges);
    if (activeRange) {
      removeRanges(activeHighlight, [activeRange]);
    }
    matchRanges = [];
    activeRange = null;
  };

  return {
    id,
    messageIndex,
    contentPartIndex,
    apply(term: string) {
      clearMatches();

      const trimmed = term.trim();
      if (!trimmed) return 0;

      const text = container.textContent ?? "";
      const offsets = findMatchOffsets(text, trimmed);
      if (offsets.length === 0) return 0;

      const textNodes = collectTextNodes(container);
      const ranges: Range[] = [];
      for (const offset of offsets) {
        const range = rangeFromOffset(textNodes, offset);
        if (range) ranges.push(range);
      }

      matchRanges = ranges;

      const matchHighlight = getOrCreateHighlight(MATCH_KEY, 0);
      if (matchHighlight) {
        for (const range of ranges) {
          matchHighlight.add(range);
        }
      }

      return ranges.length;
    },
    goTo(localIndex: number) {
      if (localIndex < 0 || localIndex >= matchRanges.length) return;

      const activeHighlight = getOrCreateHighlight(ACTIVE_KEY, 1);
      if (activeRange && activeHighlight) {
        activeHighlight.delete(activeRange);
      }

      activeRange = matchRanges[localIndex];
      if (activeHighlight && activeRange) {
        activeHighlight.add(activeRange);
      }

      if (activeRange) {
        scrollRangeIntoView(activeRange);
      }
    },
    clearActive() {
      if (!activeRange) return;
      const activeHighlight = getOrCreateHighlight(ACTIVE_KEY, 1);
      if (activeHighlight) {
        activeHighlight.delete(activeRange);
      }
      activeRange = null;
    },
    destroy() {
      clearMatches();
    },
  };
}
