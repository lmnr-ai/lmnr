import { findMatchOffsets, type MatchOffset } from "@/components/traces/span-view/searchable/find-matches";
import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

const MATCH_CLASS = "span-search-match";
const ACTIVE_CLASS = "span-search-active";

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

function unwrapMark(mark: HTMLElement) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
  }
  parent.removeChild(mark);
  parent.normalize();
}

/** Wrap each text-node slice of `offset` in a `<mark>`. Process one offset at a time
 *  after a fresh text-node walk — callers must wrap from last match to first so earlier
 *  offsets stay valid. */
function wrapOffset(root: HTMLElement, offset: MatchOffset): HTMLElement[] {
  const { spans } = collectSearchable(root);
  const marks: HTMLElement[] = [];

  for (const span of spans) {
    if (offset.end <= span.start || offset.start >= span.end) continue;

    const localStart = Math.max(0, offset.start - span.start);
    const localEnd = Math.min(span.node.length, offset.end - span.start);
    if (localStart >= localEnd) continue;

    // Split so the matched slice is its own text node, then wrap it.
    let node = span.node;
    if (localEnd < node.length) {
      node.splitText(localEnd);
    }
    if (localStart > 0) {
      node = node.splitText(localStart);
    }

    const mark = document.createElement("mark");
    mark.className = MATCH_CLASS;
    node.parentNode?.insertBefore(mark, node);
    mark.appendChild(node);
    marks.push(mark);
  }

  return marks;
}

function scrollMarkIntoView(mark: HTMLElement) {
  mark.scrollIntoView({ block: "center", behavior: "instant" });
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
  // Each match may span multiple text nodes → multiple marks.
  let matchMarks: HTMLElement[][] = [];
  let activeIndex = -1;

  const clearActiveClass = () => {
    if (activeIndex < 0 || activeIndex >= matchMarks.length) {
      activeIndex = -1;
      return;
    }
    for (const mark of matchMarks[activeIndex]) {
      mark.classList.remove(ACTIVE_CLASS);
    }
    activeIndex = -1;
  };

  const clearMatches = () => {
    clearActiveClass();
    // Unwrap last→first so sibling splits stay stable while walking.
    for (let i = matchMarks.length - 1; i >= 0; i--) {
      for (let j = matchMarks[i].length - 1; j >= 0; j--) {
        unwrapMark(matchMarks[i][j]);
      }
    }
    matchMarks = [];
  };

  return {
    id,
    messageIndex,
    contentPartIndex,
    apply(term: string) {
      clearMatches();

      const trimmed = term.trim();
      if (!trimmed) return 0;

      const { text } = collectSearchable(container);
      const offsets = findMatchOffsets(text, trimmed);
      if (offsets.length === 0) return 0;

      // Wrap last→first so earlier character offsets remain valid in the live DOM.
      const marksByMatch: HTMLElement[][] = new Array(offsets.length);
      for (let i = offsets.length - 1; i >= 0; i--) {
        marksByMatch[i] = wrapOffset(container, offsets[i]);
      }
      matchMarks = marksByMatch;

      return matchMarks.length;
    },
    goTo(localIndex: number) {
      if (localIndex < 0 || localIndex >= matchMarks.length) return;

      clearActiveClass();
      activeIndex = localIndex;
      const marks = matchMarks[localIndex];
      for (const mark of marks) {
        mark.classList.add(ACTIVE_CLASS);
      }
      if (marks[0]) {
        scrollMarkIntoView(marks[0]);
      }
    },
    clearActive() {
      clearActiveClass();
    },
    destroy() {
      clearMatches();
    },
  };
}
