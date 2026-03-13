import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSpans, getSpans, GetSpansSchema } from "@/lib/actions/spans";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;

  const parseResult = parseUrlParams(new URL(req.url).searchParams, GetSpansSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return { items: [] };
  }

  return await getSpans({ ...parseResult.data, projectId });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const spanIds = new URL(req.url).searchParams.getAll("id");

  await deleteSpans({ spanIds, projectId });
  return { success: true };
});
