import { parseUrlParams } from "@/lib/actions/common/utils";
import { getDebuggerSessions, GetDebuggerSessionsSchema } from "@/lib/actions/debugger-sessions";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);

  const parseResult = parseUrlParams(searchParams, GetDebuggerSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getDebuggerSessions({
    ...parseResult.data,
    projectId: params.projectId,
  });
});
