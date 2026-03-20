## Open

- [QA-BLOCKED] Signal detail page (`/signals/[id]`) crashes on load with a Drizzle query error: `Failed query: select "id", "value", "created_at", "undefined" from "signal_triggers"`. The `signalTriggers.mode` column resolves to `undefined` at runtime. Investigation shows the `mode` column was added in commit `60cfdf10` (migration 0075) but the QA database may not have this migration applied. The schema definition is correct (`mode: smallint().default(0).notNull()`) and our branch added `mode: signalTriggers.mode` to the `getSignal` query. This is a **database migration issue**, not a code bug — the migration needs to be applied in the QA environment. File: `frontend/lib/actions/signals/index.ts` line 197.

- [QA-BLOCKED] Tests 5 (signal event row click), 6 (trace-id copy), and 7 (URL persistence) cannot be verified because the signal detail page crashes on load due to the Drizzle query error above.

## Fixed

- [QA] Clicking "Signals (N)" button in trace view header crashes the app. Fixed in `b776a464` — hardened signal panel rendering: added shallow equality to Zustand selectors preventing re-render cascades, added defensive checks for API response data (Array.isArray, events fallback, prompt nullability), added document.body guard on createPortal, and switched to individual store selectors in SignalEventsPanel for stable references.
