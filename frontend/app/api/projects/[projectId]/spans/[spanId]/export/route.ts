import { ExportSpanSchema, exportSpanToDataset } from "@/lib/actions/span";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; spanId: string }, unknown>(async (req, params) => {
  const { projectId, spanId } = params;

  const body = await req.json();

  const result = ExportSpanSchema.safeParse({
    ...body,
    spanId,
    projectId,
  });

  if (!result.success) {
    throw new HttpError("Invalid request body", 400);
  }

  await exportSpanToDataset(result.data);

  return "Span exported to dataset successfully";
});
