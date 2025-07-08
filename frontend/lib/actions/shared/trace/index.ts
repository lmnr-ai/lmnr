import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";
import { Trace } from "@/lib/traces/types";

export const GetSharedTraceSchema = z.object({
  traceId: z.string(),
});

export const getSharedTrace = async (input: z.infer<typeof GetSharedTraceSchema>) => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const trace = (await db.query.traces.findFirst({
    where: eq(traces.id, traceId),
  })) as undefined | Trace;

  return trace;
};
