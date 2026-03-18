## Open

(none)

## Fixed

- [QA] **MINOR: Streaming indicator disappears once streaming begins (T3.12).** In `agent-panel.tsx` line 287, the "Thinking..." indicator only renders when `status === "submitted"`. Once the status transitions to `"streaming"` (i.e., chunks are arriving), the indicator vanishes. The streaming text itself serves as a visual cue, but the acceptance criteria explicitly require a "streaming indicator during generation." Expected: a visible indicator (spinner, pulsing dots, etc.) remains while `status === "streaming"` or at minimum while the last message is still being appended. Fix: also show an indicator when `status === "streaming"`, e.g., a small spinner after the last message, or change condition to `(status === "submitted" || status === "streaming")`.
  - Fixed in 01797e6b — changed condition to `(status === "submitted" || status === "streaming")`

- [QA] **MINOR: Send button not disabled during "submitted" status (T3.12 related).** In `agent-panel.tsx` line 330, the send button is disabled only when `status === "streaming"`, but not when `status === "submitted"` (the brief period between sending and first chunk arriving). This allows the user to fire off a second message during that window. Fix: change to `disabled={input.trim() === "" || status === "streaming" || status === "submitted"}`.
  - Fixed in 01797e6b — added `status === "submitted"` to disabled condition

- [QA] **MINOR: Duplicate prefill with same text is ignored (T3.9/T3.10 edge case).** In `agent-panel.tsx` lines 180-185, the ref-based prefill detection compares `prefillInput !== lastPrefillRef.current`. If a suggestion sets `prefillInput` to the same string as a previous prefill, it will not be detected and the textarea won't be updated. Fix: use a counter or timestamp alongside the text, or clear the ref after consumption so the next identical prefill is detected.
  - Fixed in 01797e6b — clear `lastPrefillRef` to `null` after prefill is consumed so identical text triggers again

- [Designer] **MINOR: Inline span buttons have no cursor:pointer styling.** In `agent-panel.tsx` lines 102-112 and 129-141, the `<button>` elements that render inline span references have no explicit cursor or hover styling. Unlike the rest of the platform where interactive elements show visual hover feedback, these buttons look like plain text. The user has no visual affordance that these are clickable. Fix: add `cursor-pointer` and a hover style (e.g., `hover:bg-primary/90 rounded transition-colors`) to the span button elements, matching how clickable inline elements appear elsewhere.
  - Fixed in 01797e6b — added `cursor-pointer hover:bg-primary/90 rounded transition-colors` to both span buttons

- [Designer] **MINOR: Inline span buttons missing accessible focus styles.** The `<button>` elements in the custom `code` component (agent-panel.tsx lines 102-112 and 128-141) have no `focus-visible` ring or outline. This violates keyboard accessibility expectations. Fix: add `focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded` or similar to these buttons.
  - Fixed in 01797e6b — added `focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary` to both span buttons

- [Designer] **MINOR: Agent panel "New Chat" button does not disable during streaming.** In `agent-panel.tsx` line 243, the "New Chat" button has no `disabled` prop. If the user clicks "New Chat" while the agent is streaming, it will call `setMessages([])` mid-stream which could cause visual glitches or lost state. Compare with `chat.tsx` line 226 which disables the button with `disabled={newChatLoading}`. Fix: add `disabled={status === "streaming" || status === "submitted"}` to the New Chat button.
  - Fixed in 01797e6b — added `disabled={status === "streaming" || status === "submitted"}`

- [Designer] **MINOR: Agent panel missing gradient overlay at top of messages area.** The existing `chat.tsx` (line 197) has a `bg-gradient-to-b from-background to-transparent` overlay at the top of the scroll area that provides a polished fade effect when scrolling. The agent panel in `agent-panel.tsx` does not have this. This is a visual inconsistency between the two chat experiences. Fix: add the same gradient overlay div above or inside the `Conversation` component.
  - Fixed in 01797e6b — added gradient overlay div with `bg-gradient-to-b from-background to-transparent`

- [Designer] **MINOR: Agent panel missing `minimal-scrollbar` class on scroll container.** The existing `chat.tsx` line 196 applies `minimal-scrollbar` to its outer scroll div for a cleaner scrollbar appearance. The agent panel in `agent-panel.tsx` line 213 uses `overflow-auto` but does not include `minimal-scrollbar`. Fix: add `minimal-scrollbar` class to the `grow flex flex-col overflow-auto relative` div.
  - Fixed in 01797e6b — added `minimal-scrollbar` class to scroll container

- [Designer] **MINOR: Send button uses both `bg-primary` and `variant="ghost"` which conflict.** In `agent-panel.tsx` line 328-329, the send button has `variant="ghost"` but also `className="... bg-primary"`. The ghost variant sets its own background (`bg-transparent` and hover states), and the explicit `bg-primary` overrides it. This is fragile — a future shadcn/ui update could change the ghost variant's specificity and break the styling. Fix: use `variant="default"` (which already applies `bg-primary`) and add only the extra classes like `rounded-full border h-7 w-7`, or remove the variant prop entirely. Same issue exists in `chat.tsx` line 326 — this was likely copy-pasted from there.
  - Fixed in 01797e6b — changed to `variant="default"` and removed redundant `bg-primary` from className

- [Designer] **MINOR: Empty state icon differs from existing chat.** The agent panel's empty state (agent-panel.tsx line 218) uses a large `MessageCircleQuestion` icon at `size-8` with `mb-3` and a descriptive paragraph. The existing chat.tsx (line 207) uses the same icon but at `w-3.5 h-3.5` inline with a "Try asking" label. The agent panel's empty state is more prominent and visually different. This is arguably an improvement, but if consistency with the existing chat is desired, they should match. Low priority — the agent panel version is reasonable as a standalone design.
  - Fixed in 01797e6b — left as-is; the agent panel's more prominent empty state is an intentional improvement over the existing chat pattern

- [Designer] **MINOR: CompactTraceCard is not expandable while SqlToolCard is.** The spec says tool calls should render as "simple thin cards" with expand behavior. The `CompactTraceCard` has no expand/collapse — it is a static card. While there may not be useful content to expand into for trace context, the visual treatment is inconsistent: `SqlToolCard` has a clickable header with chevron icons, while `CompactTraceCard` is just a flat div. Consider: adding a subtle expand area to `CompactTraceCard` that shows a brief summary or token count of the fetched context, even if minimal. Alternatively, document that this asymmetry is intentional.
  - Fixed in 01797e6b — asymmetry is intentional; CompactTraceCard has no meaningful content to expand into (it only fetches context for the LLM, not displayable data), so adding expand would be misleading

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
