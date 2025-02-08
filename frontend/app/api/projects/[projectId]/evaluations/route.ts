import { and, desc, eq, getTableColumns, inArray, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";
import { Evaluation } from "@/lib/evaluation/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const groupId = req.nextUrl.searchParams.get("groupId");
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? 25);
  const pageNumber = Number(req.nextUrl.searchParams.get("pageNumber") ?? 0);
  const filters: SQL[] = [eq(evaluations.projectId, projectId)];
  if (groupId) {
    filters.push(eq(evaluations.groupId, groupId));
  }

  const columns = getTableColumns(evaluations);

  const result = await paginatedGet<any, Evaluation>({
    table: evaluations,
    columns: {
      ...columns,
      dataPointsCount: sql<number>`COALESCE((
        SELECT COUNT(*)
        FROM ${evaluationResults} dp
        WHERE dp.evaluation_id = evaluations.id
      ), 0)::int`.as("dataPointsCount"),
    },
    filters,
    pageSize,
    pageNumber,
    orderBy: desc(evaluations.createdAt),
  });

  return Response.json(result);
}

export async function DELETE(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const evaluationIds = searchParams.get("evaluationIds")?.split(",");

  if (!evaluationIds) {
    return new Response("At least one Evaluation ID is required", {
      status: 400,
    });
  }

  try {
    await db
      .delete(evaluations)
      .where(and(inArray(evaluations.id, evaluationIds), eq(evaluations.projectId, projectId)));

    return new Response("Evaluations deleted successfully", { status: 200 });
  } catch (error) {
    console.error("Error deleting evaluations:", error);
    return new Response("Error deleting evaluations", { status: 500 });
  }
}
