/** The app-wide provider is 0ms, which is right for an icon button and wrong for
 *  a row of them. */
export const TOOLTIP_DELAY_MS = 300;

/** Shared by the panel's three chips — cluster button, "Open in Signals", enum
 *  pill — so they read as one object doing three jobs. Each adds its own inset. */
export const CHIP = "flex h-5.5 items-center gap-1.25 rounded-2xl text-[11px] font-medium";

/** Marks a chip as a way out of the trace. */
export const CHIP_ARROW = "size-[13px] shrink-0 opacity-60";
