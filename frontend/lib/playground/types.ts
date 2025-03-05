import { DataContent } from "ai";

import { playgrounds } from "@/lib/db/migrations/schema";
import { Provider } from "@/lib/pipeline/types";

import { ChatMessage } from "../types";

export type Playground = typeof playgrounds.$inferSelect & {
  promptMessages: ChatMessage[];
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

export interface Message {
  role: "system" | "user" | "assistant";
  content: Array<ImagePart | TextPart>;
}

export interface PlaygroundForm {
  model: `${Provider}:${string}`;
  messages: Message[];
}
