import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;
  const search = req.nextUrl.searchParams.get("search");
  const filterParams = req.nextUrl.searchParams.getAll("filter");

  const filters = [eq(playgrounds.projectId, projectId)];

  // Add search condition
  if (search) {
    filters.push(ilike(playgrounds.name, `%${search}%`));
  }

  // Add filter conditions
  if (filterParams && filterParams.length > 0) {
    filterParams.forEach((filterStr) => {
      try {
        const filter: FilterDef = JSON.parse(filterStr);
        const { column, operator, value } = filter;

        if (column === "name") {
          if (operator === "eq") filters.push(eq(playgrounds.name, value));
          else if (operator === "contains") filters.push(ilike(playgrounds.name, `%${value}%`));
        } else if (column === "id") {
          if (operator === "eq") filters.push(eq(playgrounds.id, value));
          else if (operator === "contains") filters.push(ilike(playgrounds.id, `%${value}%`));
        }
      } catch (error) {
        // Skip invalid filter
      }
    });
  }

  const result = await paginatedGet({
    table: playgrounds,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(playgrounds.createdAt)],
    columns: {
      id: playgrounds.id,
      name: playgrounds.name,
      createdAt: playgrounds.createdAt,
    },
  });

  return new Response(JSON.stringify(result));
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const body = await req.json();

  const result = await db
    .insert(playgrounds)
    .values({
      projectId,
      name: body.name,
    })
    .returning();

  if (result.length === 0) {
    return new Response("Failed to create playground", { status: 500 });
  }

  return new Response(JSON.stringify(result[0]));
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const searchParams = req.nextUrl.searchParams;
  const playgroundIds = searchParams.get("playgroundIds")?.split(",").filter(Boolean);

  if (!playgroundIds) {
    return new Response("At least one playground id is required", { status: 400 });
  }

  try {
    await db
      .delete(playgrounds)
      .where(and(inArray(playgrounds.id, playgroundIds), eq(playgrounds.projectId, projectId)));

    return new Response("Playgrounds deleted successfully", { status: 200 });
  } catch (error) {
    return new Response("Error deleting playgrounds", { status: 500 });
  }
}
