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

    const result = await executeSafeQuery(sqlQuery, projectId);

    return NextResponse.json({ success: true, result: normalizeQueryResult(result.result), warnings: result.warnings });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage, success: false, result: null, warnings: null }, { status: 500 });
  }
}
