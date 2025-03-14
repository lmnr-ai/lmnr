import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const result = await db.query.playgrounds.findMany({
    where: eq(playgrounds.projectId, projectId),
    orderBy: [desc(playgrounds.createdAt)],
    columns: {
      id: true,
      name: true,
      createdAt: true,
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
