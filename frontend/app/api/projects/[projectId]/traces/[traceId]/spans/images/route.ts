import { getSpanImages } from "@/lib/actions/span/images";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const body = await req.json();
  const { spanIds } = body;

  if (!Array.isArray(spanIds)) {
    throw new HttpError("spanIds must be an array", 400);
  }

  const images = await getSpanImages({ projectId, traceId, spanIds });
  return { images };
});
