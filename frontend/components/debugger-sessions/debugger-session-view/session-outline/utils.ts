// Anchor ids + markdown-heading parsing shared by the right-rail outline
// (session-outline) and the note renderer (note-markdown stamps the same id onto
// each rendered heading). The id is derived purely from the heading's text via
// `slugify`, computed identically on both sides — no dependency on Streamdown's
// rehype pipeline (its sanitizer strips/clobbers ids added there) or render
// order. Anchors are trace-prefixed so identical headings across runs don't
// collide in the page.

export interface NoteHeading {
  level: number;
  text: string;
  slug: string;
}

// Lowercase, collapse every run of non-alphanumerics to one dash, trim dashes.
// Robust to inline markdown: "My **bold** plan" and the rendered "My bold plan"
// both collapse to "my-bold-plan".
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const traceAnchorId = (traceId: string): string => `outline-trace-${traceId}`;
export const headingAnchorId = (traceId: string, slug: string): string => `outline-h-${traceId}-${slug}`;

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

// Pull ATX (`#`-prefixed) headings out of a note's markdown, skipping fenced
// code blocks so a commented-out `# foo` inside a code sample isn't listed.
export const parseNoteHeadings = (md?: string): NoteHeading[] => {
  if (!md) return [];
  const out: NoteHeading[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m) {
      const text = m[2].replace(/\s*#+\s*$/, "").trim();
      out.push({ level: m[1].length, text, slug: slugify(text) });
    }
  }
  return out;
};
