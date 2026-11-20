import { type NextRequest } from "next/server";

import { streamParquet } from "@/lib/actions/dataset";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; datasetId: string; idx: string }> }
) {
  const { projectId, datasetId, idx } = await params;

  const { stream, fileName, contentLength } = await streamParquet(projectId, datasetId, parseInt(idx));

  const fallback = fileName.replace(/[^A-Za-z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "no-cache",
  };

  // Add Content-Length if available for better streaming behavior
  if (contentLength) {
    headers["Content-Length"] = contentLength.toString();
  }

  return new Response(stream, { headers });
}
