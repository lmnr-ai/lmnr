import { and, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { labelingQueueItems, labelingQueues } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const body = await req.json();
  const { name } = body;

  const queue = await db
    .insert(labelingQueues)
    .values({
      name,
      projectId,
    })
    .returning()
    .then((res) => res[0]);

  if (!queue) {
    return new Response(JSON.stringify({ error: "Failed to create queue" }), { status: 500 });
  }

  return new Response(JSON.stringify(queue), { status: 200 });
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;
  const search = req.nextUrl.searchParams.get("search");
  const filterParams = req.nextUrl.searchParams.getAll("filter");

  const filters = [eq(labelingQueues.projectId, projectId)];

  // Add search condition
  if (search) {
    filters.push(ilike(labelingQueues.name, `%${search}%`));
  }

  // Add filter conditions
  if (filterParams && filterParams.length > 0) {
    filterParams.forEach((filterStr) => {
      try {
        const filter: FilterDef = JSON.parse(filterStr);
        const { column, operator, value } = filter;

        if (column === "name") {
          if (operator === "eq") filters.push(eq(labelingQueues.name, value));
          else if (operator === "contains") filters.push(ilike(labelingQueues.name, `%${value}%`));
        } else if (column === "id") {
          if (operator === "eq") filters.push(eq(labelingQueues.id, value));
          else if (operator === "contains") filters.push(ilike(labelingQueues.id, `%${value}%`));
        }
      } catch (error) {
        // Skip invalid filter
      }
    });
  }

  const queuesData = await paginatedGet({
    table: labelingQueues,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(labelingQueues.createdAt)],
    columns: {
      ...getTableColumns(labelingQueues),
      count: sql<number>`COALESCE((
        SELECT COUNT(*)
        FROM ${labelingQueueItems} lqi 
        WHERE lqi.queue_id = labeling_queues.id
      ), 0)::int`,
    },
  });

  return new Response(JSON.stringify(queuesData), { status: 200 });
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const queueIds = searchParams.get("queueIds")?.split(",");

  if (!queueIds) {
    return new Response("At least one Queue ID is required", { status: 400 });
  }

  try {
    await db
      .delete(labelingQueues)
      .where(and(inArray(labelingQueues.id, queueIds), eq(labelingQueues.projectId, projectId)));

    return new Response("queues deleted successfully", { status: 200 });
  } catch (error) {
    console.error("Error deleting queues:", error);
    return new Response("Error deleting queues", { status: 500 });
  }
}
