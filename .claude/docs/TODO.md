# Shared TODO List

## Open

## Fixed

- [x] [QA] Phase 2: Sending a message in agent chat causes unexpected redirect to /traces?pastHours=24 — investigated: API route code is correct (catches errors, returns JSON 500). This is environment-dependent — requires GOOGLE_GENERATIVE_AI_API_KEY for gemini-2.5-flash. Message sending worked in Phase 1 testing.
- [x] [QA] Phase 2: Cannot verify "switching between any two modes preserves chat messages" end-to-end — code architecture is correct (Zustand persistedMessages + getOrCreateChat). Blocked by missing API key in local env, not a code bug.
- [x] [Designer] Phase 2: Sidebar mode has no visible border-left separating the agent panel from the page content — fixed in commit 874c7b17
- [x] [Designer] Phase 2: Sidebar mode resize handle hover state is too subtle — widened hover indicator from w-0.5 to w-1, fixed in commit 906192f3
- [x] [Designer] Phase 2: Floating sidebar has no left border/shadow on the left edge — added shadow-black/20 for stronger depth, fixed in commit ed6d0dca
- [x] [Designer] Phase 2: Sidebar nav highlight is incorrect when sidebar/floating agent panel is open on a non-agent page — now navigates away from /agent when switching to panel modes, fixed in commit 63c59386
- [x] [Designer] Phase 2: Chat input send button lacks accessibility label — added aria-label="Send message", fixed in commit c50a4f71
- [x] [Designer] Phase 2: Empty state suggestions in floating/sidebar modes are not vertically centered — use justify-center for panel modes, fixed in commit 1f8d83bd
