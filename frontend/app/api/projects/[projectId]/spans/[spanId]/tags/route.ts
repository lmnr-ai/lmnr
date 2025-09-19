import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { addSpanTag } from "@/lib/actions/tags";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { tagClasses, tags, users } from "@/lib/db/migrations/schema";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;

  const res = await db
    .select({
      id: tags.id,
      createdAt: tags.createdAt,
      classId: tags.classId,
      spanId: tags.spanId,
      name: tagClasses.name,
      email: users.email,
    })
    .from(tags)
    .innerJoin(tagClasses, eq(tags.classId, tagClasses.id))
    .leftJoin(users, eq(tags.userId, users.id))
    .where(eq(tags.spanId, spanId))
    .orderBy(desc(tags.createdAt));

  return new Response(JSON.stringify(res), { status: 200 });
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = (await req.json()) as { classId: string; name: string };

  const res = await addSpanTag({
    spanId,
    projectId,
    name: body.name,
    classId: body.classId,
    userId: user.id,
  });
  return new Response(JSON.stringify(res), { status: 200 });
}
