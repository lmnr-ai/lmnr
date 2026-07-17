import { findMatchOffsets, type MatchOffset } from "@/components/traces/span-view/searchable/find-matches";
import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

// CSS Custom Highlight API names, styled via ::highlight(...) in globals.css.
// Highlights paint through Ranges without touching the DOM — mark-wrapping is
// not an option here: splitting/reparenting Streamdown's React-managed text
// nodes corrupts the next reconciliation pass.
const MATCH_HIGHLIGHT = "span-search-match";
const ACTIVE_HIGHLIGHT = "span-search-active";

// lib.dom's Highlight/HighlightRegistry interfaces omit their setlike/maplike
// members (TS 5.8), so we type the surface we use.
interface HighlightLike {
  priority: number;
  add(range: AbstractRange): void;
  delete(range: AbstractRange): boolean;
}

interface SharedHighlights {
  match: HighlightLike;
  active: HighlightLike;
}

// One Highlight object per name, shared by all sources (the registry is
// document-global); each source only adds/deletes its own ranges.
function getSharedHighlights(): SharedHighlights | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") {
    return null;
  }
  const registry = CSS.highlights as unknown as Map<string, HighlightLike>;

  let match = registry.get(MATCH_HIGHLIGHT);
  if (!match) {
    match = new Highlight() as unknown as HighlightLike;
    registry.set(MATCH_HIGHLIGHT, match);
  }

  let active = registry.get(ACTIVE_HIGHLIGHT);
  if (!active) {
    active = new Highlight() as unknown as HighlightLike;
    active.priority = 1; // paint over the plain match highlight
    registry.set(ACTIVE_HIGHLIGHT, active);
  }

  return { match, active };
}

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

// prettier-ignore
const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DETAILS", "DIV", "DL", "DT",
  "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
  "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE",
  "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);

function nearestBlock(node: Text, root: Node): Node {
  let el: Node | null = node.parentNode;
  while (el && el !== root) {
    if (el instanceof HTMLElement && BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentNode;
  }
  return root;
}

/** Walk `root`'s text nodes, building the searchable text alongside the node→offset
 *  mapping. A virtual "\n" is inserted at block-element (and <br>) boundaries so
 *  matches can't join text that isn't contiguous when rendered — `textContent`
 *  concatenates blocks with no separator. Text and spans share one position counter,
 *  so offsets from one always map onto the other. */
function collectSearchable(root: HTMLElement): { spans: TextNodeSpan[]; text: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const spans: TextNodeSpan[] = [];
  const parts: string[] = [];
  let pos = 0;
  let prevBlock: Node | null = null;
  let sawLineBreak = false;
  let current: Node | null;

  while ((current = walker.nextNode())) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      if ((current as HTMLElement).tagName === "BR") sawLineBreak = true;
      continue;
    }

    const text = current as Text;
    const len = text.length;
    if (len === 0) continue;

    const block = nearestBlock(text, root);
    if (sawLineBreak || (prevBlock !== null && block !== prevBlock)) {
      parts.push("\n");
      pos += 1;
    }
    prevBlock = block;
    sawLineBreak = false;

    spans.push({ node: text, start: pos, end: pos + len });
    parts.push(text.data);
    pos += len;
  }

  return { spans, text: parts.join("") };
}

/** A single Range can span multiple text nodes: anchor its start in the first
 *  overlapping span and its end in the last. */
function rangeForOffset(spans: TextNodeSpan[], offset: MatchOffset): Range | null {
  let startSpan: TextNodeSpan | null = null;
  let endSpan: TextNodeSpan | null = null;

  for (const span of spans) {
    if (offset.end <= span.start) break;
    if (offset.start >= span.end) continue;
    startSpan ??= span;
    endSpan = span;
  }
  if (!startSpan || !endSpan) return null;

  const range = document.createRange();
  range.setStart(startSpan.node, Math.max(0, offset.start - startSpan.start));
  range.setEnd(endSpan.node, Math.min(endSpan.node.length, offset.end - endSpan.start));
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
  // Without Highlight API support, matches are still counted and scrolled to;
  // they just don't paint.
  const highlights = getSharedHighlights();
  let ranges: Range[] = [];
  let activeRange: Range | null = null;

  const clearActive = () => {
    if (activeRange) {
      highlights?.active.delete(activeRange);
      activeRange = null;
    }
  };

  const clearMatches = () => {
    clearActive();
    if (highlights) {
      for (const range of ranges) {
        highlights.match.delete(range);
      }
    }
    ranges = [];
  };

  return {
    id,
    messageIndex,
    contentPartIndex,
    apply(term: string) {
      clearMatches();

      const trimmed = term.trim();
      if (!trimmed) return 0;

      const { spans, text } = collectSearchable(container);
      const offsets = findMatchOffsets(text, trimmed);

      for (const offset of offsets) {
        const range = rangeForOffset(spans, offset);
        if (!range) continue;
        ranges.push(range);
        highlights?.match.add(range);
      }

      return ranges.length;
    },
    goTo(localIndex: number) {
      const range = ranges[localIndex];
      if (!range) return;

      clearActive();
      activeRange = range;
      highlights?.active.add(range);
      scrollRangeIntoView(range);
    },
    clearActive,
    destroy() {
      clearMatches();
    },
  };
}
