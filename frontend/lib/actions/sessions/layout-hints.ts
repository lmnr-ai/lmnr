export const REQUEST_SHAPED_NAMES = new Set([
  "user_request",
  "task",
  "query",
  "user_query",
  "USER_QUERY",
  "user_instructions",
  "signal_description",
  "user-request",
  "user-query",
  "user-instruction",
]);

export const CONTENT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "a",
  "div",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "sub",
  "sup",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "img",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "small",
  "kbd",
  "var",
]);

const OPEN_TAG = /<([a-zA-Z_][\w-]*)>/g;
const CLOSE_TAG = /<\/([a-zA-Z_][\w-]*)>/g;
const LEAD_OPEN = /^\s*<([a-zA-Z_][\w-]*)>/;
const TRAIL_CLOSE = /<\/([a-zA-Z_][\w-]*)>\s*$/;

export type LayoutHints = {
  startsWithTag: string | null;
  endsWithClosingTag: string | null;
  firstTag: string | null;
  lastClosingTag: string | null;
  proseLengthBeforeFirstTag: number;
  charsAfterLastClose: number;
  balancedTags: string[];
  requestShapedTag: string | null;
};

export function computeLayoutHints(text: string): LayoutHints {
  const leadMatch = text.match(LEAD_OPEN);
  const startsWithTag = leadMatch ? leadMatch[1] : null;

  const trailMatch = text.match(TRAIL_CLOSE);
  const endsWithClosingTag = trailMatch ? trailMatch[1] : null;

  // First non-content tag in document order (open or close).
  const allTagMatches: { name: string; index: number; isClose: boolean }[] = [];
  for (const m of text.matchAll(OPEN_TAG)) {
    allTagMatches.push({ name: m[1], index: m.index ?? 0, isClose: false });
  }
  for (const m of text.matchAll(CLOSE_TAG)) {
    allTagMatches.push({ name: m[1], index: m.index ?? 0, isClose: true });
  }
  allTagMatches.sort((a, b) => a.index - b.index);

  let firstTag: string | null = null;
  let firstTagIndex = -1;
  for (const t of allTagMatches) {
    if (!CONTENT_TAGS.has(t.name)) {
      firstTag = t.name;
      firstTagIndex = t.index;
      break;
    }
  }

  // Balanced wrapper tags: appear as both <X> and </X>, not in CONTENT_TAGS.
  const openNames = new Set<string>();
  for (const m of text.matchAll(OPEN_TAG)) openNames.add(m[1]);
  const closeNames = new Set<string>();
  for (const m of text.matchAll(CLOSE_TAG)) closeNames.add(m[1]);

  const balancedSet = new Set<string>();
  for (const name of openNames) {
    if (closeNames.has(name) && !CONTENT_TAGS.has(name)) {
      balancedSet.add(name);
    }
  }
  const balancedTags = Array.from(balancedSet).sort();

  // Last closing wrapper tag: rightmost </X> among balanced wrappers.
  let lastClosingTag: string | null = null;
  let lastCloseIndex = -1;
  let lastCloseEnd = -1;
  for (const m of text.matchAll(CLOSE_TAG)) {
    if (balancedSet.has(m[1])) {
      const idx = m.index ?? 0;
      if (idx >= lastCloseIndex) {
        lastCloseIndex = idx;
        lastCloseEnd = idx + m[0].length;
        lastClosingTag = m[1];
      }
    }
  }

  const charsAfterLastClose = lastCloseEnd >= 0 ? text.slice(lastCloseEnd).trim().length : text.trim().length;

  const proseLengthBeforeFirstTag =
    firstTagIndex >= 0 ? text.slice(0, firstTagIndex).trim().length : text.trim().length;

  let requestShapedTag: string | null = null;
  for (const name of balancedTags) {
    if (REQUEST_SHAPED_NAMES.has(name)) {
      requestShapedTag = name;
      break;
    }
  }

  return {
    startsWithTag,
    endsWithClosingTag,
    firstTag,
    lastClosingTag,
    proseLengthBeforeFirstTag,
    charsAfterLastClose,
    balancedTags,
    requestShapedTag,
  };
}

function fmt(value: string | null): string {
  return value ?? "null";
}

export function buildUserMessage(text: string, hints: LayoutHints): string {
  const balanced = hints.balancedTags.length > 0 ? hints.balancedTags.join(",") : "none";
  return [
    "<layout_hints>",
    `starts_with_wrapper_tag: ${fmt(hints.startsWithTag)}`,
    `ends_with_closing_tag: ${fmt(hints.endsWithClosingTag)}`,
    `non_whitespace_after_last_close: ${hints.charsAfterLastClose}`,
    `prose_chars_before_first_tag: ${hints.proseLengthBeforeFirstTag}`,
    `first_tag: ${fmt(hints.firstTag)}`,
    `last_closing_wrapper_tag: ${fmt(hints.lastClosingTag)}`,
    `balanced_tags_present: ${balanced}`,
    `request_shaped_balanced_tag: ${fmt(hints.requestShapedTag)}`,
    "</layout_hints>",
    "",
    "<input>",
    text,
    "</input>",
  ].join("\n");
}
