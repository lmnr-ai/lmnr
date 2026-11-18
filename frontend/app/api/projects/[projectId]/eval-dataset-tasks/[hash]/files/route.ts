import { getEvalDatasetTaskFiles } from "@/lib/actions/eval-datasets/files";
import { apiHandler } from "@/lib/api/api-handler";

/** The files of a pushed task, `[hash]` the 64 hex of its `sha256:` hash. */
export const GET = apiHandler<{ projectId: string; hash: string }>(async (_req, ctx) => {
  const { projectId, hash } = await ctx.params;
  return Response.json(await getEvalDatasetTaskFiles({ projectId, hex: hash }));
});
