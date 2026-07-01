import GithubSlugger from "github-slugger";

// Anchor ids + markdown-heading parsing shared by the right-rail outline
// (session-outline) and the note renderer (RunComment stamps the same ids onto
// rendered headings post-render, in DOM order). One `parseNoteHeadings` pass
// over the SAME (span-tag-transformed) note string is the single source of
// truth: slugs come from a fresh GithubSlugger per note, so duplicate titles
// dedupe to `setup-1`, `setup-2`. No dependency on Streamdown's rehype pipeline
// (its sanitizer strips ids added there) and no per-heading slugging at render
// time (Streamdown renders block-by-block, so node positions are unusable for
// ordering). Anchors are trace-prefixed so identical headings across runs
// don't collide in the page.

export interface NoteHeading {
  level: number;
  text: string;
  slug: string;
}

// Loose text normalizer used to MATCH a rendered heading's textContent against a
// parsed heading's raw text (inline markdown collapses away). Not an anchor id —
// anchors come from the stateful GithubSlugger in `parseNoteHeadings`.
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const traceAnchorId = (traceId: string): string => `outline-trace-${traceId}`;
export const headingAnchorId = (traceId: string, slug: string): string => `outline-h-${traceId}-${slug}`;
export const evalAnchorId = (evaluationId: string): string => `outline-eval-${evaluationId}`;

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

// Reduce `[label](url)` to `label` so headings containing links (incl. rewritten
// span tags) display and slug as their visible text.
const stripMdLinks = (text: string): string => text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

// Pull ATX (`#`-prefixed) headings out of a note's markdown, skipping fenced
// code blocks so a commented-out `# foo` inside a code sample isn't listed.
export const parseNoteHeadings = (md?: string): NoteHeading[] => {
  if (!md) return [];
  const slugger = new GithubSlugger();
  const out: NoteHeading[] = [];
  let inFence = false;
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(lines[i]);
    if (m) {
      const text = stripMdLinks(m[2].replace(/\s*#+\s*$/, "").trim()).trim();
      out.push({ level: m[1].length, text, slug: slugger.slug(text) });
    }
  }
  return out;
};
