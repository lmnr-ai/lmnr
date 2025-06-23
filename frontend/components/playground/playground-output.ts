import { GenerateTextResult, ToolSet } from "ai";
import { create } from "zustand";

export type OutputState = Pick<GenerateTextResult<ToolSet, {}>, "text" | "reasoning" | "toolCalls" | "usage"> & {
  isLoading: boolean;
  history: boolean;
  reasoningOpen: boolean;
  error?: Error;
};

export type OutputActions = {
  setText: (text: OutputState["text"]) => void;
  setReasoning: (reasoning: OutputState["reasoning"]) => void;
  setToolCalls: (toolCalls: OutputState["toolCalls"]) => void;
  setUsage: (usage: OutputState["usage"]) => void;
  setIsLoading: (isLoading: OutputState["isLoading"]) => void;
  setReasoningOpen: (reasoning: OutputState["reasoningOpen"]) => void;
  setHistory: (history: OutputState["history"]) => void;
  reset: () => void;
};

const initialState: OutputState = {
  text: "",
  reasoning: "",
  toolCalls: [],
  usage: {
    totalTokens: NaN,
    promptTokens: NaN,
    completionTokens: NaN,
  },
  history: false,
  isLoading: false,
  reasoningOpen: false,
};

export type PlaygroundOutputStore = OutputState & OutputActions;

export const usePlaygroundOutput = create<PlaygroundOutputStore>()((set) => ({
  ...initialState,

  setText: (text) => set({ text }, false),

  setReasoning: (reasoning) => set({ reasoning }, false),

  setToolCalls: (toolCalls) => set({ toolCalls }, false),

  setUsage: (usage) => set({ usage }, false),

  setIsLoading: (isLoading) => set({ isLoading }, false),

  setReasoningOpen: (reasoningOpen) => set({ reasoningOpen }, false),

  setHistory: (history) => set({ history }, false),

  reset: () => set(initialState),
}));
