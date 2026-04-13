"use client";

import Chat from "@/components/traces/trace-view/chat";
import TraceViewStoreProvider from "@/components/traces/trace-view/store";

import { useSessionViewStore } from "./store";

/**
 * AI Chat for the session view.
 *
 * TODO(session-view): scope chat to the full session. For now we scope to the
 * first trace in the session — this matches the spec's explicit TODO. When
 * session-scoped chat is built server-side, swap `traceId` for a session
 * identifier.
 *
 * Mounts a disposable `TraceViewStoreProvider` purely as plumbing because
 * `<Chat>` reads `pendingChatInjection` / `consumePendingChatInjection` from
 * the trace-view base store. The session view's own state remains in the
 * session-view store.
 */
export default function SessionChatPanel() {
  const { traces, setChatOpen } = useSessionViewStore((s) => ({
    traces: s.traces,
    setChatOpen: s.setChatOpen,
  }));

  const firstTrace = traces[0];

  if (!firstTrace) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-sm text-muted-foreground">
        Chat will be available once the session's traces are loaded.
      </div>
    );
  }

  return (
    <TraceViewStoreProvider key={`session-chat-${firstTrace.id}`} storeKey="session-view-inner-chat" initialChatOpen>
      <div className="flex flex-col h-full w-full overflow-hidden">
        <Chat
          traceId={firstTrace.id}
          onSetSpanId={() => {
            // TODO(session-view): when Chat references a span id, select that
            // span in the session view (need to look up which trace the span
            // belongs to — possibly via backend lookup).
          }}
          onClose={() => setChatOpen(false)}
        />
      </div>
    </TraceViewStoreProvider>
  );
}
