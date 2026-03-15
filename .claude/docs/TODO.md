# Shared TODO List

## Open



## Fixed

- [x] [Designer] Phase 1: Header does not use the shared `<Header>` component (`components/ui/header.tsx`). Every other page in the app uses `<Header path="...">` which provides consistent h-12 height, SidebarTrigger, and standard padding (pl-2.5 pr-4). The agent page instead uses a custom `div` with `px-4 py-2 border-b` and an `h2`. Replace with `<Header path="laminar agent">` and move the view-mode icons into the Header's `children` slot. — fixed in commit dffb6aac
- [x] [Designer] Phase 1: Chat content area has no max-width constraint. On wide screens the user message bubbles and assistant responses stretch across the entire viewport width, making text lines very long and hard to read. Add a `max-w-3xl mx-auto` (or similar) wrapper around the conversation content, matching the pattern of modern chat UIs. The chat input should have the same max-width constraint so everything aligns. — fixed in commit 28f2fc9d
- [x] [Designer] Phase 1: User message bubble uses full-width (`w-full`) styling, stretching edge to edge. In the reference Ask AI chat (`components/traces/trace-view/chat.tsx`) this works because the panel is narrow. In full-screen mode, user messages should have a constrained width or right-align with a max-width so they look like discrete message bubbles rather than full-width banners. — fixed in commit 95549387
- [x] [Designer] Phase 1: Empty state suggestions are vertically centered in the viewport but positioned slightly too high due to the chat input taking space at the bottom. The empty state content plus input should be visually balanced — consider pushing suggestions lower (closer to the input) so they feel connected to the input area, similar to the Claude or ChatGPT empty state pattern where suggestions sit just above the input. — fixed in commit 15eab7c9
- [x] [Designer] Phase 1: Send button stays visually prominent (orange/primary fill) even when disabled. When disabled (empty input), the button should appear more muted — use a lower opacity or secondary background so users understand the button is not actionable. Currently the filled primary circle with a dimmed arrow is not a clear enough disabled state. — fixed in commit 65b73793
- [x] [Designer] Phase 1: The "Laminar Agent is in beta and can make mistakes" disclaimer text is outside the scrollable area and always visible, but it sits very close to the input with only `pb-2` spacing. Add slightly more bottom padding (pb-3 or pb-4) for breathing room, and consider reducing font size to text-[10px] to make it more subtle. — fixed in commit 33c4d02a
