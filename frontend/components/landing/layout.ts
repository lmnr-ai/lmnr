// Single source of truth for the landing's 880px center column. Reused
// across the landing page, pricing, blog list, and blog post layouts so
// the header / footer / content all sit on the same axis.

export const LANDING_COLUMN_PX = 880;

// Tailwind utility classes. Bracket-notation classes work with our Tailwind
// scanner (see globals.css @source declarations).
export const LANDING_COLUMN_MAX_W = "max-w-[880px]";
export const LANDING_COLUMN_W = "w-[880px]";

// Convenience: "centered 880px column with sensible horizontal padding". Most
// callers want this shape on top of `w-full`.
export const LANDING_COLUMN_CENTERED = "w-full max-w-[880px] mx-auto px-6 md:px-0";
