import { NextRequest } from "next/server";
import { z } from "zod/v4";

import { getAutocompleteSuggestions } from "@/lib/actions/autocomplete";

const QueryParamsSchema = z.object({
  prefix: z.string().default(""),
});

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const { searchParams } = req.nextUrl;

  try {
    const suggestions = await getAutocompleteSuggestions({
      projectId: params.projectId,
      resource: "traces",
      prefix: searchParams.get("prefix") || "",
    });

    return Response.json({ suggestions });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch autocomplete suggestions" },
      { status: 500 }
    );
  }
}
