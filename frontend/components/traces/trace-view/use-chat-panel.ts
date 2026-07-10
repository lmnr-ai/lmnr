import { useQueryState } from "nuqs";
import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";

/**
 * Chat panel open/close with the URL kept in sync via nuqs. A `chat=true`
 * deep-link (emails/Slack/notifications) force-opens the panel once at store
 * creation (see the store `merge`); closing clears the now-stale param so a
 * store remount (SidePanel key={traceId} / refresh) can't re-force it open.
 *
 * The sync is one-directional (state → URL, on the close action) — we NEVER
 * read `chat` back into store state, which is exactly the reverse sync that
 * used to re-open a chat the user had closed.
 */
export function useChatPanel() {
  const { chatOpen, setTracesAgentOpen } = useTraceViewStore(
    (s) => ({ chatOpen: s.tracesAgentOpen, setTracesAgentOpen: s.setTracesAgentOpen }),
    shallow
  );
  // nuqs defaults to history:"replace" + shallow, so this only rewrites the query string.
  const [, setChatParam] = useQueryState("chat");

  const closeChat = useCallback(() => {
    setTracesAgentOpen(false);
    // Strips ?chat= from the URL; nuqs no-ops when the param is already absent.
    setChatParam(null);
  }, [setTracesAgentOpen, setChatParam]);

  const toggleChat = useCallback(() => {
    if (chatOpen) {
      closeChat();
    } else {
      setTracesAgentOpen(true);
    }
  }, [chatOpen, closeChat, setTracesAgentOpen]);

  return { chatOpen, closeChat, toggleChat };
}
