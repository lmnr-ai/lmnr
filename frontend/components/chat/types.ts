export interface LaminarSpanContext {
  traceId: string;
  spanId: string;
  isRemote: boolean;
}

export enum ModelProvider {
  Anthropic = 0,
  Bedrock = 1,
}

export interface ActionResult {
  isDone: boolean;
  content?: string;
  error?: string;
}

export interface ChatMessageContentTextBlock {
  text: string;
}

export interface ChatMessageImageUrlBlock {
  imageUrl: string;
}

export interface ChatMessageImageBase64Block {
  imageB64: string;
}

export type ChatMessageImageBlock = { type: "url"; imageUrl: string } | { type: "base64"; imageB64: string };

export type ChatMessageContentBlock = { type: "text"; text: string } | { type: "image"; image: ChatMessageImageBlock };

export type ChatMessageContent = { summary: string; actionResult: ActionResult } | { text: string };

export interface ChatMessage {
  id: string;
  chatId: string;
  userId: string;
  messageType: "step" | "assistant" | "user";
  content: ChatMessageContent;
  createdAt?: string;
}

export interface TabInfo {
  pageId: number;
  url: string;
  title: string;
}

export interface Coordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface InteractiveElement {
  index: number;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  viewport: Coordinates;
  page: Coordinates;
  center: Coordinates;
  weight: number;
  browserAgentId: string;
  inputType?: string;
}

export interface BrowserState {
  url: string;
  tabs: TabInfo[];
  screenshotWithHighlights?: string;
  screenshot?: string;
  pixelsAbove: number;
  pixelsBelow: number;
  interactiveElements: Record<string, InteractiveElement>;
}

export interface AgentState {
  messages: ChatMessage[];
  browserState: BrowserState;
}

export interface AgentOutput {
  state: AgentState;
  result: ActionResult;
}

export interface StepChunkContent {
  messageId: string; // UUID
  actionResult: ActionResult;
  summary: string;
}

export interface FinalOutputChunkContent {
  message_id: string; // UUID
  content: AgentOutput;
}

export interface StreamAgentRequest {
  prompt: string;
  model: string;
  chatId: string;
  isNewChat: boolean;
}

export type RunAgentResponseStreamChunk =
  | ({ chunk_type: "step" } & StepChunkContent)
  | ({ chunk_type: "finalOutput" } & FinalOutputChunkContent);

export interface AgentSession {
  chatId: string;
  updatedAt: string;
  chatName: string;
  status: "not_started" | "running" | "paused" | "stopped";
  userId: string;
  machineId: string;
}
