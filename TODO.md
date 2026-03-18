## Open

## Fixed

- [Designer] **CRITICAL: Span selection highlight is broken in tree view and list (reader) view.** The tree's `span-card.tsx` (line 50-51) and list's `list-item.tsx` (line 31-32) still read `selectedSpan` from the Zustand store (`state.selectedSpan`), but the nuqs migration in `trace-view/index.tsx` now uses `setSpanId()` (URL param) and never calls `setSelectedSpan()`. As a result, `selectedSpan` is always `undefined` in the store, so no span ever appears highlighted (no blue left border in list view, no highlight in tree view). Fix: these child components need to use the `useSpanId()` hook (or receive the selected spanId as a prop) and compare against `spanId` from URL params instead of `state.selectedSpan`.
  - [QA] Confirmed by Quincy. This causes failures in T1.2, T1.3, T1.5, T1.11. The `isSelected` check in `span-card.tsx:77` and `list-item.tsx:68` will always be false.
  - Fixed in eed271f9

- [Designer] **CRITICAL: Auto-scroll to selected span is broken in tree and list views.** Both `tree/index.tsx` (lines 44-59) and `list/index.tsx` (lines 48-63) compute `selectedSpanIndex` from `state.selectedSpan`, which is always `undefined` after the nuqs migration. This means when a user clicks a span in the condensed timeline or mini-tree, the tree/list will not auto-scroll to reveal the selected span. Fix: derive `selectedSpanIndex` from the nuqs `spanId` instead of the deprecated `state.selectedSpan`.
  - [QA] Confirmed by Quincy. This causes failures in T1.5 (back/forward won't scroll to span) and T1.11 (regression in span selection).
  - Fixed in eed271f9
