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

export type OpenAIProviderOptions = {
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
