import { NextRequest, NextResponse } from "next/server";

import { extractBearerToken, validateProjectApiKey } from "@/lib/auth-utils";
import { executeSafeQuery } from "@/lib/sql/transpile";

export async function POST(
  request: NextRequest,
) {
  try {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get("Authorization");
    const bearerToken = extractBearerToken(authHeader);

    if (!bearerToken) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header. Expected: Bearer <token>" },
        { status: 401 }
      );
    }

    // Validate the project API key
    const apiKeyData = await validateProjectApiKey(bearerToken);
    if (!apiKeyData) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    const { sqlQuery } = await request.json();

    if (!sqlQuery?.trim()) {
      return NextResponse.json(
        { error: "SQL query is required" },
        { status: 400 }
      );
    }

    // Execute the query with the authenticated project ID
    const result = await executeSafeQuery(sqlQuery, apiKeyData.projectId);

    return NextResponse.json({
      success: true,
      result: result.result,
      warnings: result.warnings
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: errorMessage, success: false, result: null, warnings: null },
      { status: 500 }
    );
  }
}
