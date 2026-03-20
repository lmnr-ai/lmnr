## Open

## Fixed

- [Designer] **Controls: Add visual separator between heatmap toggle and zoom buttons.** Fixed in `9fde1034`. Added `<div className="w-px h-3 bg-border mx-0.5" />` divider between the dollar sign button and the zoom button group.

- [Designer] **Controls: Add tooltip to the cost heatmap toggle button.** Fixed in `9fde1034`. Wrapped the dollar sign button in `TooltipProvider > Tooltip > TooltipTrigger` with text "Toggle cost heatmap", following the existing codebase pattern.

- [Designer] **Heatmap: `selectMaxSpanCost` is called per-element as a function, not exposed as derived state.** Fixed in `a26752cb`. Moved `selectMaxSpanCost()` call to the parent `CondensedTimeline` component, computed once via `useMemo`, and passed down as a `maxSpanCost` prop to each `CondensedTimelineElement`.
