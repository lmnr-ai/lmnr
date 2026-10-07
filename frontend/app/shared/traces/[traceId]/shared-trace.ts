import { cache } from "react";
import { z } from "zod/v4";

import { getSharedTrace } from "@/lib/actions/shared/trace";

export const getCachedSharedTrace = cache((traceId: string) => getSharedTrace({ traceId }));

// getSharedTrace throws a ZodError on a non-UUID, which would surface as the error boundary rather than a 404.
export const isValidTraceId = (traceId: string) => z.guid().safeParse(traceId).success;
