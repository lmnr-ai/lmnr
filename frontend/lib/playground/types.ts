import { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { DataContent, ToolChoice, ToolSet } from "ai";

import { Provider } from "@/components/playground/types";
import { playgrounds } from "@/lib/db/migrations/schema";

export type Playground = typeof playgrounds.$inferSelect & {
  promptMessages: Message[];
  toolChoice: ToolChoice<any>;
  tools: string;
};

export type PlaygroundInfo = Pick<Playground, "id" | "name" | "createdAt">;

export interface ImagePart {
  type: "image";
  image: DataContent | URL;
}

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: any;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: Array<ImagePart | TextPart | ToolResultPart | ToolCallPart>;
}

type OpenAIProviderOptions = {
  openai: {
    reasoningEffort: "low" | "medium" | "high";
  };
};

export type ProviderOptions =
  | { anthropic: AnthropicProviderOptions }
  | OpenAIProviderOptions
  | { google: GoogleGenerativeAIProviderOptions }
  | {};

export interface PlaygroundForm<T extends ToolSet = ToolSet> {
  model: `${Provider}:${string}`;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  providerOptions: ProviderOptions;
  messages: Message[];
  tools?: string;
  toolChoice?: ToolChoice<T>;
}

export const openAIThinkingModels = [
  "openai:o4-mini",
  "openai:o3",
  "openai:o3-mini",
  "openai:o1",
  "openai:o1-mini",
  "openai:o1-preview",
];

export const anthropicThinkingModels = [
  "anthropic:claude-3-7-sonnet-20250219:thinking",
  "anthropic:claude-4-sonnet-20250514:thinking",
  "anthropic:claude-4-opus-20250514:thinking",
];

export const googleThinkingModels = [
  "gemini:gemini-2.5-flash-preview-05-20:thinking",
  "gemini:gemini-2.5-pro-exp-03-25:thinking",
  "gemini:gemini-2.5-pro-preview-05-06:thinking",
];
