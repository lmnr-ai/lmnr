// Common text classnames for the redesigned landing page.
// Import and combine with cn() from "@/lib/utils".
//
// All text is left-aligned by default (the redesign uses an 880px center
// column with left-aligned content). `whitespace-pre-line` is kept so callers
// can still pass `\n` for explicit line breaks where it matches Figma.

// Hero title — used once for "Open-source Agent Monitoring".
export const mainTitle =
  "font-sans-landing text-[38px] sm:text-[42px] font-[480] text-white whitespace-pre-line leading-tight";

export const subSection = "font-sans-landing text-white whitespace-pre-line text-2xl leading-8 font-[500]";

// One step smaller than `subSection` — used for sub-section titles
// (e.g. "2.1", "2.2" under a parent subSection like "Understand why
// in seconds"). Same weight + font, smaller scale.
export const subSubSection =
  "font-sans-landing font-medium text-white whitespace-pre-line text-lg leading-6 font-[500]";

// Section body copy under each subSection — "MCP, CLI, and SQL API to bring Laminar...", etc.
export const bodyMedium = "font-sans-landing text-foreground-200 whitespace-pre-line text-lg";

// Tiny, wide-tracked muted label — used for step numbers above section
// titles ("03.", "04.", ...) and for the SectionFootnote name + LEARN
// MORE row at the bottom of each surface-550 mock panel. Single source
// of truth so all those labels stay visually consistent.
export const microLabel = "font-sans-landing text-foreground-300";

// Center-column width for the landing/blog/pricing pages. Scales up on
// xl/2xl screens so the column doesn't look cramped on large displays.
export const LANDING_COLUMN_MAX_W = "max-w-[880px] 2xl:max-w-[1000px] 3xl:max-w-[1100px]";
