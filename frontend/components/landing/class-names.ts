// Common text classnames for the redesigned landing page.
// Import and combine with cn() from "@/lib/utils".
//
// Pre-redesign components live alongside their post-redesign replacements as
// `<name>_old.tsx` and import the legacy palette from `./class-names_old`.

// Hero title — used once for "Open-source Agent Monitoring".
export const mainTitle =
  "font-manrope font-medium text-white text-center whitespace-pre-line md:text-[32px] md:leading-tight text-[28px] leading-tight";

// Section subtitle — "Get alerts when your agent breaks.", "Has this issue occurred before?", etc.
export const subSection =
  "font-manrope font-medium text-white text-center whitespace-pre-line md:text-2xl md:leading-7 text-xl leading-6";

// Section body copy under each subSection — "A clear, concise view of your agent run", etc.
export const bodyMedium =
  "font-sans text-landing-text-300 text-center whitespace-pre-line md:text-lg md:leading-7 text-base leading-5";
