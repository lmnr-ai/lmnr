// Common text classnames for the redesigned landing page.
// Import and combine with cn() from "@/lib/utils".
//
// All text is left-aligned by default (the redesign uses an 880px center
// column with left-aligned content). `whitespace-pre-line` is kept so callers
// can still pass `\n` for explicit line breaks where it matches Figma.

// Hero title — used once for "Open-source Agent Monitoring".
export const mainTitle =
  "font-manrope font-medium text-white whitespace-pre-line md:text-[32px] md:leading-tight text-[28px] leading-tight tracking-[-0.02em]";

export const subSection =
  "font-manrope font-medium text-white whitespace-pre-line text-2xl leading-8 tracking-[-0.02em]";

// One step smaller than `subSection` — used for sub-section titles
// (e.g. "2.1", "2.2" under a parent subSection like "Understand why
// in seconds"). Same weight + font, smaller scale.
export const subSubSection = "font-manrope font-medium text-white whitespace-pre-line text-lg leading-6";

// Section body copy under each subSection — "MCP, CLI, and SQL API to bring Laminar...", etc.
export const bodyMedium = "text-white/80 whitespace-pre-line";

// Tiny, wide-tracked muted label — used for step numbers above section
// titles ("03.", "04.", ...) and for the SectionFootnote name + LEARN
// MORE row at the bottom of each surface-550 mock panel. Single source
// of truth so all those labels stay visually consistent.
export const microLabel = "text-sm text-landing-text-400";
