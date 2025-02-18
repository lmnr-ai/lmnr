import { DataContent } from "ai";

import { playgrounds } from "@/lib/db/migrations/schema";
import { Provider } from "@/lib/pipeline/types";

import { ChatMessage } from "../types";

export type Playground = typeof playgrounds.$inferSelect & {
  promptMessages: ChatMessage[];
};

interface ImagePart {
  type: "image";
  image: DataContent | URL;
}

interface TextPart {
  type: "text";
  text: string;
}

interface SimpleMessage {
  role: "system" | "user" | "assistant";
  content: ImagePart[] | TextPart[] | string;
}

export interface PlaygroundForm {
  model: `${Provider}:${string}`;
  messages: SimpleMessage[];
}
