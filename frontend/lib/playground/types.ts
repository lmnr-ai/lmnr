import { ChatMessage } from "../types";
import { playgrounds } from "@/lib/db/migrations/schema";

export type Playground = typeof playgrounds.$inferSelect & {
  promptMessages: ChatMessage[];
};
