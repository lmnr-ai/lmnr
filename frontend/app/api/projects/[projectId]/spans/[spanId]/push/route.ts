import { PushSpanSchema, pushSpanToLabelingQueue } from "@/lib/actions/span";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; spanId: string }, unknown>(async (req, params) => {
  const { projectId, spanId } = params;

  const body = await req.json();

  const result = PushSpanSchema.safeParse({
    ...body,
    projectId,
    spanId,
  });

  if (!result.success) {
    throw new HttpError("Invalid request body", 400);
  }

  await pushSpanToLabelingQueue(result.data);

  return "Span pushed to labeling queue successfully";
});
