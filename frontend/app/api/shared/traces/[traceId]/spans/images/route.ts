import { getSharedSpanImages } from "@/lib/actions/shared/spans/images";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ traceId: string }, { images: Awaited<ReturnType<typeof getSharedSpanImages>> }>(
  async (req, { traceId }) => {
    const body = await req.json();
    const { spanIds } = body;

    if (!Array.isArray(spanIds)) {
      throw new Error("spanIds must be an array");
    }

    const images = await getSharedSpanImages({ traceId, spanIds });
    return { images };
  }
);
