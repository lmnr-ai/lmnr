## Open

(none)

## Fixed

- [Designer] **MINOR: Collapsed FAB has conflicting Tailwind transition classes.** In `collapsed-button.tsx` line 18, both `transition-shadow` and `transition-transform` are applied. In Tailwind, these are separate `transition-property` declarations and the second one overrides the first, so the `hover:shadow-xl` transition will not animate — only the scale transform will. Fix: use `transition-all` or a custom `transition` class that includes both `box-shadow` and `transform` properties.
  - Fixed in 54f702e7 — replaced `transition-shadow` + `transition-transform` with `transition-all`

- [Designer] **MINOR: Floating panel lacks explicit background color on outer container.** In `floating-panel.tsx` line 14, the outer `<div>` has `border shadow-xl` but no `bg-background` class. The inner `AgentPanel` does set `bg-background`, but the outer rounded container with `overflow-hidden` should also have it to prevent any sub-pixel rendering gaps at the border-radius corners. Fix: add `bg-background` to the floating panel's outer div.
  - Fixed in 54f702e7 — added `bg-background` to outer div

- [Designer] **MINOR: ResizableHandle in side-by-side has no visual affordance.** In `side-by-side-wrapper.tsx` line 26, the `<ResizableHandle />` is bare with no styling or `withHandle` prop. Other ResizableHandle usages across the codebase consistently apply either `withHandle` (for a visible drag grip) or hover color feedback (e.g., `className="hover:bg-blue-400 z-10 transition-colors"`). Without any visual cue, users may not realize the panel boundary is draggable. Fix: add `withHandle` prop or apply hover styling consistent with existing patterns.
  - Fixed in 54f702e7 — added `withHandle` prop

- [Designer] **MINOR: Floating panel positioning may overlap with collapsed FAB.** The collapsed button is at `bottom-6 right-6` (24px inset) and the floating panel is at `right-4 bottom-4` (16px inset). When transitioning from collapsed to floating, the panel appears slightly closer to the corner than the button was. This is fine functionally but the inconsistent offset is visually noticeable. Consider: align the floating panel's bottom-right corner with the FAB position (`bottom-6 right-6`) for a smoother perceived transition.
  - Fixed in 54f702e7 — aligned floating panel to `bottom-6 right-6` matching FAB position

- [Designer] **MINOR: LaminarAgent component in layout is outside the SideBySideWrapper.** In `layout.tsx` lines 62-66, `<SideBySideWrapper>` wraps only the main content, and `<LaminarAgent />` (which renders CollapsedButton and FloatingPanel) is placed as a sibling after it inside SidebarInset. This means the collapsed FAB and floating panel render outside the resizable panel group, which is correct for those fixed-position elements. However, this architecture means the floating panel's `z-50` will compete with sheets/dialogs also at `z-50`. If a sheet opens while the floating panel is visible, they will overlap unpredictably. Consider: using `z-[60]` or a higher z-index for the floating panel to ensure it stays above sheets, or document that floating panel should auto-collapse when a sheet opens.
  - Fixed in 54f702e7 — bumped floating panel z-index to `z-[60]`

- [Designer] **INFO: Spec mentions icon logic — verify correctness.** The spec says the floating panel should show "Lucide Panel Right" to switch to side-by-side, and side-by-side should show an icon to switch to floating. The implementation in `agent-panel.tsx` line 20 maps: floating -> PanelRight, side-by-side -> Columns2. This is correct per spec. No action needed — just confirming.
  - Verified correct — no action needed, moved to Fixed

- [Designer] **CRITICAL: Span selection highlight is broken in tree view and list (reader) view.** The tree's `span-card.tsx` (line 50-51) and list's `list-item.tsx` (line 31-32) still read `selectedSpan` from the Zustand store (`state.selectedSpan`), but the nuqs migration in `trace-view/index.tsx` now uses `setSpanId()` (URL param) and never calls `setSelectedSpan()`. As a result, `selectedSpan` is always `undefined` in the store, so no span ever appears highlighted (no blue left border in list view, no highlight in tree view). Fix: these child components need to use the `useSpanId()` hook (or receive the selected spanId as a prop) and compare against `spanId` from URL params instead of `state.selectedSpan`.
  - [QA] Confirmed by Quincy. This causes failures in T1.2, T1.3, T1.5, T1.11. The `isSelected` check in `span-card.tsx:77` and `list-item.tsx:68` will always be false.
  - Fixed in eed271f9

- [Designer] **CRITICAL: Auto-scroll to selected span is broken in tree and list views.** Both `tree/index.tsx` (lines 44-59) and `list/index.tsx` (lines 48-63) compute `selectedSpanIndex` from `state.selectedSpan`, which is always `undefined` after the nuqs migration. This means when a user clicks a span in the condensed timeline or mini-tree, the tree/list will not auto-scroll to reveal the selected span. Fix: derive `selectedSpanIndex` from the nuqs `spanId` instead of the deprecated `state.selectedSpan`.
  - [QA] Confirmed by Quincy. This causes failures in T1.5 (back/forward won't scroll to span) and T1.11 (regression in span selection).
  - Fixed in eed271f9
