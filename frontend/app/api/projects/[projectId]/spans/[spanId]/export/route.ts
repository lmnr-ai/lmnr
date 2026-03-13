import { ExportSpanSchema, exportSpanToDataset } from "@/lib/actions/span";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; spanId: string }, unknown>(async (req, params) => {
  const { projectId, spanId } = params;

  const body = await req.json();

  const result = ExportSpanSchema.safeParse({
    ...body,
    spanId,
    projectId,
  });

  if (!result.success) {
    throw new Error("Invalid request body");
  }

  await exportSpanToDataset(result.data);

  return "Span exported to dataset successfully";
});
