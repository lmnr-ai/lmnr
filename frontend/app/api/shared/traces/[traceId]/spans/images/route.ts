import { getSharedSpanImages } from "@/lib/actions/shared/spans/images";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ traceId: string }, { images: Awaited<ReturnType<typeof getSharedSpanImages>> }>(
  async (req, { traceId }) => {
    const body = await req.json();
    const { spanIds } = body;

    if (!Array.isArray(spanIds)) {
      throw new HttpError("spanIds must be an array", 400);
    }

    const images = await getSharedSpanImages({ traceId, spanIds });
    return { images };
  }
);
