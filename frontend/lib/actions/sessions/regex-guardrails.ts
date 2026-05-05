import { type LayoutHints, REQUEST_SHAPED_NAMES } from "./layout-hints";

export const KNOWN_WRAPPERS_FOR_LEAK_CHECK = new Set([
  ...REQUEST_SHAPED_NAMES,
  "system-reminder",
  "system_reminder",
  "context",
  "env",
  "tool_list",
  "metadata",
  "session",
  "EXTRA_INFO",
  "issue_description",
  "research_findings",
  "currently_viewing",
  "system_notes",
  "user-prompt-submit-hook",
  "skills",
  "reminder",
]);

export function isStaticallyValid(pattern: string): boolean {
  if (!pattern.startsWith("(?s)")) return false;
  if (pattern.includes("<!--") || pattern.includes("-->")) return false;

  const tagNames = new Set<string>();
  const tagRe = /<\/?([a-zA-Z_][\w-]*)>/g;
  for (const m of pattern.matchAll(tagRe)) tagNames.add(m[1]);
  if (tagNames.size >= 2) return false;

  const groups = (pattern.match(/\((?!\?)/g) || []).length;
  return groups === 1;
}

export function patternBOnTrailingTag(pattern: string, hints: LayoutHints): boolean {
  if (!hints.endsWithClosingTag) return false;
  const m = pattern.match(/^\(\?s\)\.\*<\/([a-zA-Z_][\w-]*)>\\s\*\(\.\*\)$/);
  return m !== null && m[1] === hints.endsWithClosingTag;
}

export function captureLeaksWrapperTag(captured: string): boolean {
  const lead = captured.trimStart().slice(0, 200);
  for (const t of KNOWN_WRAPPERS_FOR_LEAK_CHECK) {
    if (lead.startsWith(`<${t}>`) || lead.startsWith(`<${t} `)) return true;
  }
  return false;
}
