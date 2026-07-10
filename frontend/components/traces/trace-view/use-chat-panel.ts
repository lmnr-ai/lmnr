import { useQueryState } from "nuqs";
import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";

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
