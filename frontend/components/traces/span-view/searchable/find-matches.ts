export interface MatchOffset {
  start: number;
  end: number;
}

/** Non-letter/non-number runs (Unicode-aware). */
const NON_ALNUM = "[^\\p{L}\\p{N}]+";

export function buildSearchRegex(query: string): RegExp | null {
  const tokens = query
    .split(new RegExp(NON_ALNUM, "u"))
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[\\.*+?^${}()|[\]]/g, "\\$&"));

  if (tokens.length === 0) {
    return null;
  }

  const core = tokens.length === 1 ? tokens[0] : tokens.join(NON_ALNUM);
  return new RegExp(core, "iu");
}

export function findMatchOffsets(text: string, term: string): MatchOffset[] {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const regex = buildSearchRegex(trimmed);
  if (!regex) return [];

  const globalRegex = new RegExp(regex.source, "giu");
  const offsets: MatchOffset[] = [];
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(text)) !== null) {
    if (match[0].length === 0) {
      globalRegex.lastIndex++;
      continue;
    }
    offsets.push({ start: match.index, end: match.index + match[0].length });
  }

  return offsets;
}

export function countMatches(text: string, term: string): number {
  return findMatchOffsets(text, term).length;
}
