// Common text classnames for the redesigned landing page.
// Import and combine with cn() from "@/lib/utils".
//
// All text is left-aligned by default (the redesign uses an 880px center
// column with left-aligned content). `whitespace-pre-line` is kept so callers
// can still pass `\n` for explicit line breaks where it matches Figma.

// Hero title — used once for "Open-source Agent Monitoring".
export const mainTitle =
  "font-manrope font-medium text-white whitespace-pre-line md:text-[32px] md:leading-tight text-[28px] leading-tight tracking-[-0.02em]";

// Section subtitle — "Get alerts when your agent breaks.", "Has this issue occurred before?", etc.
export const subSection =
  "font-manrope font-medium text-white whitespace-pre-line text-2xl leading-7 tracking-[-0.02em]";

// Section body copy under each subSection — "MCP, CLI, and SQL API to bring Laminar...", etc.
export const bodyMedium = "font-sans text-landing-text-300 whitespace-pre-line text-lg leading-6";
