// Every number that shapes the icicle strip, in one place. They were tuned
// against each other in a live panel and then frozen — several are load-bearing
// for the fold arithmetic, so the comments here are about what breaks when one
// moves rather than about what it does.

/** The bands themselves. Everything is CSS, so the units are plain pixels. */
export const BAND = {
  /** Height of one band. Rows stack `rowHeight + rowGap` apart. */
  rowHeight: 20,
  /** Corner radius. Enough to round a 20px band into a pill, and it stays one as
   *  the height moves. */
  radius: 16,
  /** Vertical space between a band and its children's row, and so the length of
   *  the stem a nested band draws up to its parent. At 0 the rows fuse and the
   *  stems disappear with the gap. */
  rowGap: 10,
  /**
   * The wider gap separating one top-level group from the next: used between the
   * roots and between the children of an L3 cluster, so the strip breaks into
   * groups at the top instead of reading as one continuous run.
   */
  groupGap: 10,
  /** Horizontal space between siblings inside a group. */
  columnGap: 2,
  /**
   * Floor under a band's width, so a tiny cluster stays clickable. The fold
   * arithmetic is tuned around it and the strip stops meaning anything if it
   * moves far.
   */
  minWidth: 20,
  /**
   * Inset on the band itself, not on its label. A band squeezed to `minWidth`
   * then leaves the label a content box of `minWidth - 2 * paddingX`, which is
   * near zero — so the text disappears on its own, with no measuring. Widen the
   * band and it comes back.
   */
  paddingX: 2,
  labelSize: 10,
  /** Extra leading inset on the label. There is no glyph standing in the corner,
   *  so without it the text starts hard against the pill's curve. Trailing edge
   *  is where the label truncates, and padding there only cuts a word earlier. */
  labelPadLeft: 4,
  /**
   * A wash of the cluster's colour laid OVER the band's neutral surface step, not
   * instead of it, so it stays a tint of the surface rather than a colour of its
   * own. Three states: the band under the pointer (or pinned), a band with no
   * focus on it or under the focus, and a band some other cluster has stolen the
   * focus from.
   */
  fill: { hover: 0.3, default: 0.24, muted: 0.12 },
  /** The ring, in the same colour. Always drawn, at the same strength in every
   *  state — the surface step and the wash carry the state on their own. */
  outline: { hover: 0.04, default: 0.04, muted: 0.04 },
} as const;

/**
 * Marks a band with its cluster id, so the strip can read hover off one
 * delegated `pointerover` instead of a leave/enter pair per band. The pair wrote
 * a `null` between two bands, and a `null` focus un-mutes every band on the
 * strip — so a sweep re-rendered the whole forest twice per step.
 */
export const BAND_ID_ATTR = "data-cluster-band";

/** The hairline joining a nested band to the row above it. Its LENGTH is
 *  `BAND.rowGap`; wider than this and it reads as a second thing on the strip. */
export const STEM = { width: 2, className: "bg-surface-up-8" } as const;

/**
 * Focusing a cluster with children paints its whole column — its own band plus
 * every descendant row — as one panel, so the subtree reads as living inside it.
 * Leaves get none; it would just double the ring around a single pill.
 */
export const PANEL = {
  /** Opacity of the ring, in the cluster's colour. The fill is a neutral surface
   *  step: with a dozen coloured bands sitting on it, another tint of the same
   *  hue underneath just muddies them. */
  outline: 0.2,
  outlineWidth: 1,
  /** Bottom two corners. The top two are `radiusTop`, kept tighter because that
   *  end of the panel wraps the focused band's own pill. */
  radius: 14,
  radiusTop: 10,
  /** Inset on the focused cluster's children row, pulling the subtree in from the
   *  panel's edges. On the row rather than on each band, so it reads as one
   *  margin around the group. */
  padX: 4,
  padBottom: 4,
} as const;

/**
 * THE invariant behind the fold. Free space is the width left over once every
 * column is at its floor, and it is what the proportional (flex-grow) split has
 * to express sizes with. At zero every band is pinned to `BAND.minWidth`, the
 * strip stops being a bar chart, and the widths stop meaning anything. Clusters
 * are admitted biggest-first until admitting one more would break it.
 */
export const FREE_SPACE_TARGET = 0.3;

/** The extra-clusters counter: the pill standing in for the siblings a row had
 *  no width for. */
export const EXTRA = {
  /**
   * Flat surface, and ONLY surface. A counter stands for the clusters there was
   * no room for, so it has to sit behind the real bands rather than in front of
   * them — which is what a wash of some off-ramp grey did.
   */
  className: "bg-surface-up-4",
  /** The cluster in focus came from inside this counter. */
  focusClassName: "bg-surface-up-6",
  /** Extra inset on its label, on top of the band's own. A bare "+36" needs the
   *  room a glyph would have taken to read as centred in the pill. */
  padLeft: 2,
  /** It stands for a set, not a cluster, so it has no cluster colour to take. */
  color: "#6b7280",
} as const;

/** Height of the cluster list the counter's tooltip opens, which scrolls past
 *  this. */
export const EXTRA_LIST_HEIGHT = 470;

/**
 * The neutral surface step a band sits on, under its cluster wash. Relative to
 * the plane the section publishes, so "up 2" means two steps above whatever the
 * strip is sitting on.
 *
 * Spelled out, never interpolated: Tailwind v4's scanner only emits a utility for
 * literal class strings it finds in source, so `bg-surface-up-${n}` produces
 * nothing at all.
 *
 * A muted band steps DOWN so it recedes, and the panel sits one step below a
 * band — that one step is what keeps a focused parent's pill from merging into
 * its own panel.
 */
export const SURFACE = {
  band: "bg-surface-up-2",
  muted: "bg-surface-up",
  panel: "bg-surface-up",
} as const;
