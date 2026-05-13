import { useCallback, useRef, useState } from "react";

export type ChatStatus = "idle" | "loading" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True for transient placeholder bubbles while a turn is in flight. */
  pending?: boolean;
  /** True if this assistant turn errored — `content` carries the error message. */
  error?: boolean;
}

export interface ChatState {
  status: ChatStatus;
  messages: ChatMessage[];
  error?: string;
}

interface UseTemplateChatOptions {
  projectId: string | string[] | undefined;
  /** Called once per successful turn with the full generated code. */
  onTurnComplete?: (finalCode: string) => void;
  onError?: (message: string) => void;
}

const INITIAL: ChatState = { status: "idle", messages: [] };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m_${Date.now()}_${Math.random()}`;

export const useTemplateChat = ({ projectId, onError, onTurnComplete }: UseTemplateChatOptions) => {
  const [state, setState] = useState<ChatState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);
  // Snapshot of the persisted history we send to the API. We only append a
  // (user, assistant) pair after a turn succeeds, so retries and aborted turns
  // don't poison the model's view of the conversation.
  const persistedHistoryRef = useRef<ChatMessage[]>([]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    persistedHistoryRef.current = [];
    setState(INITIAL);
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((prev) => ({
      status: "idle",
      messages: prev.messages.filter((m) => !m.pending),
    }));
  }, []);

  const send = useCallback(
    async (input: { prompt: string; currentCode?: string; testData?: string }) => {
      if (!projectId) return;
      const trimmed = input.prompt.trim();
      if (!trimmed) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const userMessage: ChatMessage = { id: newId(), role: "user", content: trimmed };
      const placeholder: ChatMessage = { id: newId(), role: "assistant", content: "", pending: true };

      setState((prev) => ({
        status: "loading",
        messages: [...prev.messages, userMessage, placeholder],
      }));

      try {
        const res = await fetch(`/api/projects/${projectId}/render-templates/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            history: persistedHistoryRef.current.map((m) => ({ role: m.role, content: m.content })),
            currentCode: input.currentCode,
            testData: input.testData,
          }),
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          result?: string;
          summary?: string;
          error?: string;
        };

        if (controller.signal.aborted) return;

        if (!res.ok || data.success === false) {
          const message = data.error || "Failed to generate template";
          setState((prev) => ({
            status: "error",
            messages: prev.messages.map((m) =>
              m.id === placeholder.id ? { ...m, content: message, pending: false, error: true } : m
            ),
            error: message,
          }));
          onError?.(message);
          return;
        }

        if (!data.result) {
          const message = "Model returned an empty template";
          setState((prev) => ({
            status: "error",
            messages: prev.messages.map((m) =>
              m.id === placeholder.id ? { ...m, content: message, pending: false, error: true } : m
            ),
            error: message,
          }));
          onError?.(message);
          return;
        }

        const summary = data.summary?.trim() || "Updated the template";
        const assistantMessage: ChatMessage = {
          id: placeholder.id,
          role: "assistant",
          content: summary,
        };

        // Persist this exchange for the next turn's history payload. We send
        // the assistant's CODE (not the summary) so the model has a canonical
        // record of what it produced — matches `currentCode` semantics.
        persistedHistoryRef.current = [
          ...persistedHistoryRef.current,
          { ...userMessage },
          { id: placeholder.id, role: "assistant", content: data.result },
        ];

        setState((prev) => ({
          status: "idle",
          messages: prev.messages.map((m) => (m.id === placeholder.id ? assistantMessage : m)),
        }));

        onTurnComplete?.(data.result);
      } catch (e) {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : "Unexpected error";
        setState((prev) => ({
          status: "error",
          messages: prev.messages.map((m) =>
            m.id === placeholder.id ? { ...m, content: message, pending: false, error: true } : m
          ),
          error: message,
        }));
        onError?.(message);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [projectId, onError, onTurnComplete]
  );

  return { state, send, abort, reset } as const;
};
