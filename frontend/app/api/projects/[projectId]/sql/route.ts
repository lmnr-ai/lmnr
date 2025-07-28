import { isString, map, mapValues, toNumber } from "lodash";
import { NextRequest, NextResponse } from "next/server";

import { executeSafeQuery } from "@/lib/sql/transpile";

const normalizeQueryResult = (data: Record<string, any>[]) =>
  map(data, (row) =>
    mapValues(row, (value) => (isString(value) && !isNaN(toNumber(value)) && value.trim() ? toNumber(value) : value))
  );

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { sqlQuery } = await request.json();
    const projectId = (await params).projectId;

    if (!sqlQuery?.trim()) {
      return NextResponse.json({ error: "SQL query is required" }, { status: 400 });
    }

    if (process.env.QUERY_ENGINE_URL) {
      const result = await fetch(process.env.QUERY_ENGINE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: sqlQuery,
          project_id: projectId,
        }),
      });
      const resultJson = await result.json();
      return NextResponse.json({
        success: true,
        result: resultJson,
        warnings: [],
      });
    }
    const result = await executeSafeQuery(sqlQuery, projectId);

    return NextResponse.json({ success: true, result: normalizeQueryResult(result.result), warnings: result.warnings });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage, success: false, result: null, warnings: null }, { status: 500 });
  }
}
