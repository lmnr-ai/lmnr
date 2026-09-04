/** The app-wide provider is 0ms, which is right for an icon button and wrong for
 *  a row of them. */
export const TOOLTIP_DELAY_MS = 300;

/** Shared by the panel's three chips — cluster button, "Open in Signals", enum
 *  pill — so they read as one object doing three jobs. Each adds its own inset. */
export const CHIP = "flex h-5.5 items-center gap-1.25 rounded-2xl text-[11px] font-medium transition-colors";

/** Marks a chip as a way out of the trace. */
export const CHIP_ARROW = "size-[13px] shrink-0 opacity-60";

/** The two link chips. A step off the card, not a wash of a hue: the panel is an
 *  `ElevatedSurface`, so this means "three above THE CARD" wherever the card
 *  itself ends up on the ramp. */
export const CHIP_SURFACE = "bg-surface-up-3 hover:bg-surface-up-4";

/**
 * The span-reference badges inside a payload (`Bash ↗`), which ship as
 * `bg-foreground-300/20` — a fixed wash of the TEXT colour that ignores the ramp.
 *
 * They are rendered by markdown straight from a payload string and take no props,
 * so the only handle is the `data-slot` on the chip plus a descendant rule from
 * the payload container. That two-element selector also outranks the chip's own
 * class, which is what lets the override land without `!important`.
 */
export const SPAN_CHIP_SURFACE =
  "[&_[data-slot=span-chip]]:bg-surface-up-4 [&_[data-slot=span-chip]:hover]:bg-surface-up-5";
