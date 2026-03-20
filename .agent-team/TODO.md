## Open

- [QA-BLOCKED] Signal detail page (`/signals/[id]`) crashes on load with a Drizzle query error: `Failed query: select "id", "value", "created_at", "undefined" from "signal_triggers"`. The `signalTriggers.mode` column resolves to `undefined` at runtime. Investigation shows the `mode` column was added in commit `60cfdf10` (migration 0075) but the QA database may not have this migration applied. The schema definition is correct (`mode: smallint().default(0).notNull()`) and our branch added `mode: signalTriggers.mode` to the `getSignal` query. This is a **database migration issue**, not a code bug — the migration needs to be applied in the QA environment. File: `frontend/lib/actions/signals/index.ts` line 197.

- [QA-BLOCKED] Tests 5 (signal event row click), 6 (trace-id copy), and 7 (URL persistence) cannot be verified because the signal detail page crashes on load due to the Drizzle query error above.

## Fixed

- [QA] Clicking "Signals (N)" button STILL crashes with `React.Children.only`. Fixed in `347cfb12` — root cause was the `Button` component with `asChild=true`: in React 19, `React.Children.count` counts null entries, so `{IconComponent && ...}{children}` passed `[null, <Link>]` to Radix Slot, which saw count=2 and threw. Fix: when `asChild` is true, skip `IconComponent` injection and pass only `{children}` to Slot.

- [QA] Clicking "Signals (N)" button in trace view header crashes the app. Fixed in `b776a464` — hardened signal panel rendering: added shallow equality to Zustand selectors preventing re-render cascades, added defensive checks for API response data (Array.isArray, events fallback, prompt nullability), added document.body guard on createPortal, and switched to individual store selectors in SignalEventsPanel for stable references.

- [Phase 6] Span panel missing X close button. Fixed in `7440029a` — added floating close button to PanelWrapper when no title header is present, wired span panel close to `setSelectedSpan(undefined)`.

- [Phase 6] Unused `event-detail-panel.tsx` cleanup. Deleted in `7440029a` — file was no longer imported after signal page refactor (Phase 5).

- [Phase 6] Cross-page verification complete in `7440029a` — confirmed shared trace view has no Signals/Traces Agent buttons, full-screen trace page uses multi-panel layout correctly, signal page trace panel works.
