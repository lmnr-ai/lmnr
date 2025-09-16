import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { dateToNanoseconds } from "@/lib/clickhouse/utils";
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

  const [res] = await db
    .insert(tags)
    .values({
      projectId,
      classId: body.classId,
      spanId: spanId,
      userId: user.id,
    })
    .returning();

  if (res?.id) {
    await clickhouseClient.insert({
      table: "default.tags",
      format: "JSONEachRow",
      values: [
        {
          class_id: body.classId,
          span_id: spanId,
          id: res.id,
          name: body.name,
          project_id: projectId,
          source: 0,
          created_at: dateToNanoseconds(new Date()),
        },
      ],
    });
  }

  return new Response(JSON.stringify(res), { status: 200 });
}
