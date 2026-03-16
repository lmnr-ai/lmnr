# Shared TODO List

## Open

- [ ] [FIX] Collapsed FAB suggestions not proactive — should immediately react to user actions (opening a trace, viewing errors). Styling needs to be more prominent (border-primary). Should appear faster on context change.
- [ ] [FIX] Remove old "Ask AI" chat from trace view — redundant with Laminar Agent.
- [ ] [FIX] Sidebar mode + trace panel overlap — trace panel absolute positioning covers agent sidebar. Need relative container scoping.
- [ ] [FIX] Agent doesn't proactively suggest signals for failed traces — needs prompt update to auto-emit CreateSignalCard on errors.

## Comprehensive QA Test Plan

### A. Navigation & Full-screen (Phase 1)
- [ ] A1. "Laminar Agent" nav item in sidebar (last before settings)
- [ ] A2. Full-screen agent page loads at `/project/[id]/agent`
- [ ] A3. Can send message and receive streamed response
- [ ] A4. Chat state persists when navigating away and back
- [ ] A5. Top-right mode icons present (Columns2, PanelRight)

### B. View Modes (Phase 2)
- [ ] B1. Collapsed FAB visible on all pages except agent fullscreen
- [ ] B2. FAB NOT visible on agent fullscreen page
- [ ] B3. Clicking FAB opens floating sidebar with animation
- [ ] B4. Floating sidebar overlays without layout shift (~400px, fixed)
- [ ] B5. Floating sidebar has correct icons (Minus, PanelRight, Maximize)
- [ ] B6. Sidebar mode pushes content left with resizable handle
- [ ] B7. Sidebar mode has correct icons (Minus, Columns2, Maximize)
- [ ] B8. Switching floating → sidebar preserves chat messages
- [ ] B9. Switching sidebar → fullscreen preserves chat messages
- [ ] B10. Switching fullscreen → floating preserves chat messages

### C. Proactive FAB Suggestions (NEW)
- [ ] C1. Navigate to traces page — FAB banner shows trace-relevant suggestion
- [ ] C2. Open a trace (click row to add ?traceId=xxx) — FAB banner IMMEDIATELY updates with trace-specific proactive suggestion (e.g. "Analyze this trace for issues")
- [ ] C3. Navigate to evaluations page — FAB banner shows eval-relevant suggestion
- [ ] C4. Navigate to signals page — FAB banner shows signal-relevant suggestion
- [ ] C5. FAB banner styling is prominent (border-primary, noticeable text color)
- [ ] C6. Clicking the FAB banner suggestion sends it as a message in floating sidebar

### D. URL Context (Phase 5)
- [ ] D1. On traces page with ?traceId=xxx, agent knows the trace ID
- [ ] D2. Ask "How long did this trace take?" — agent answers with specific duration, does NOT ask "which trace?"
- [ ] D3. On /traces/[traceId] deep-link, same behavior
- [ ] D4. On evaluations page, suggestions are eval-relevant
- [ ] D5. On dashboard, suggestions are dashboard-relevant
- [ ] D6. Empty chat shows page-appropriate suggestion chips

### E. Tools (Phase 3)
- [ ] E1. Ask data question → agent uses querySQL, returns results
- [ ] E2. Ask about specific trace → agent uses getTraceSkeleton
- [ ] E3. Agent auto-uses getTraceSkeleton when user views trace and asks about it

### F. JSON Render Cards (Phase 4)
- [ ] F1. QuerySQLCard renders on every SQL execution (collapsible, shows SQL)
- [ ] F2. QuerySQLCard expand button shows SQL
- [ ] F3. QuerySQLCard copy button copies SQL to clipboard
- [ ] F4. QuerySQLCard "open in editor" navigates to SQL editor
- [ ] F5. MetricsCard renders for numeric summaries (labeled values)
- [ ] F6. ListCard renders for enumerable results (numbered items, no crashes with objects)
- [ ] F7. GraphCard renders chart for trends/distributions
- [ ] F8. TraceCard renders with trace data + "Open trace" link
- [ ] F9. TraceCard "Open trace" navigates to trace view
- [ ] F10. CreateSignalCard renders with signal details + "Continue to create signal" button
- [ ] F11. CreateSignalCard button navigates to signals page with prefilled data

### G. Proactive Signal Suggestions (NEW)
- [ ] G1. Ask about a failed/errored trace → agent PROACTIVELY emits CreateSignalCard
- [ ] G2. Ask "Show me recent failed traces" → agent shows data AND suggests monitoring signal
- [ ] G3. Agent proactively suggests signals without being explicitly asked

### H. Sidebar + Trace Panel Layout (NEW)
- [ ] H1. Open sidebar mode (agent chat on right)
- [ ] H2. Navigate to traces page
- [ ] H3. Click a trace to open trace panel
- [ ] H4. Trace panel stays within LEFT container — does NOT overlap agent sidebar on right
- [ ] H5. Both panels are usable simultaneously without overlap
- [ ] H6. Resizing the sidebar doesn't cause overlap

### I. Old Trace Chat Removed (NEW)
- [ ] I1. Open a trace in trace view
- [ ] I2. Verify there is NO "Ask AI" or "Chat" tab in the trace view tabs
- [ ] I3. The Laminar Agent FAB/sidebar is the ONLY way to chat about traces

### J. Error Handling
- [ ] J1. Error messages show clean text, no raw HTML
- [ ] J2. Agent handles malformed card data without crashing (object items in ListCard, etc.)

## Fixed

- [x] [BUG] URL context didn't pick up traceId from query params (2026-03-15). Fixed in `getPageContext()` and `usePageContext()`.
- [x] [BUG] ListCard crash with object items (2026-03-15). LLM sent objects instead of strings. Fixed with defensive `itemToString()` + prompt update.
- [x] [BUG] MetricsCard potential crash with non-string values (2026-03-15). Fixed with `safeString()` coercion.
- [x] [QA] All 6 card types verified (2026-03-15). TraceCard and CreateSignalCard fixed via stronger prompt instructions.
- [x] [QA] Comprehensive 15-test pass all green (2026-03-15).
