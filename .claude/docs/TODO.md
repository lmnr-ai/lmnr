# Shared TODO List

## Open

## Fixed

- [x] [QA] Phase 5: Dashboard route regex used `/dashboards/` (plural) but actual route is `/dashboard/` (singular). Fixed regex in `url-context.ts`. (566570f3)
- [x] [QA] Phase 5: Collapsed FAB suggestion banner never appeared due to unstable suggestions reference. Memoized `pageContext` in `agent-view-controller.tsx`. (9b174610)
- [x] [Designer] Phase 5: Empty state fullscreen used `justify-end`, pushing suggestions to bottom. Changed to `justify-center` for all modes. (e8fd0fd0)
- [x] [Designer] Phase 5: FAB banner had no dismiss affordance. Added X button to dismiss without opening agent. (92003c09)
- [x] [Designer] Phase 5: Below-input suggestion always showed `suggestions[0]`. Now uses `getRotatingSuggestion()` with a 10s rotation interval. (3ac7aa73)
- [x] [Designer] Phase 5: FAB banner `max-w-[240px]` too narrow. Bumped to `max-w-[280px]`. (92003c09)
- [x] [Designer] Phase 5: Empty state suggestion buttons lacked `cursor-pointer`. Added explicitly. (1a613db0)
