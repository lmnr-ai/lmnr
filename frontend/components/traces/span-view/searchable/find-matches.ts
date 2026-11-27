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

/** The global regex every search source matches `term` with; null when the term has nothing to match. */
export const searchPattern = (term: string): RegExp | null => {
  const regex = buildSearchRegex(term.trim());
  return regex && new RegExp(regex.source, "giu");
};

const eachMatch = (text: string, pattern: RegExp, visit: (start: number, end: number) => void) => {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    visit(match.index, match.index + match[0].length);
  }
};

export const findMatchOffsets = (text: string, pattern: RegExp): MatchOffset[] => {
  const offsets: MatchOffset[] = [];
  eachMatch(text, pattern, (start, end) => offsets.push({ start, end }));
  return offsets;
};

export const countMatches = (text: string, pattern: RegExp): number => {
  let count = 0;
  eachMatch(text, pattern, () => count++);
  return count;
};
