import { playgrounds } from "@/lib/db/migrations/schema";

export type Playground = typeof playgrounds.$inferSelect;
