import { NextRequest } from "next/server";

import { getAutocompleteSuggestions } from "@/lib/actions/autocomplete";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const { searchParams } = req.nextUrl;

  try {
    const suggestions = await getAutocompleteSuggestions({
      projectId: params.projectId,
      entity: "spans",
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
