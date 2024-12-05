import { playgrounds } from "@/lib/db/migrations/schema";

import { ChatMessage } from "../types";

export type Playground = typeof playgrounds.$inferSelect & {
  promptMessages: ChatMessage[];
};
