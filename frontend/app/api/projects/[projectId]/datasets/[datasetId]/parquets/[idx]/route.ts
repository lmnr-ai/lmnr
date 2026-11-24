import { streamParquet } from "@/lib/actions/dataset";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

export const GET = apiHandler<{ projectId: string; datasetId: string; idx: string }>(async (_req, { params }) => {
  const { projectId, datasetId, idx } = await params;
  const index = Number(idx);
  if (!idx || /\D/.test(idx) || !Number.isSafeInteger(index)) {
    throw new ApiError("Invalid Parquet file index", 400);
  }

  const { stream, fileName, contentLength } = await streamParquet(projectId, datasetId, index);

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-cache",
  };

  // Add Content-Length if available for better streaming behavior
  if (contentLength) {
    headers["Content-Length"] = contentLength.toString();
  }

  return new Response(stream, { headers });
});
