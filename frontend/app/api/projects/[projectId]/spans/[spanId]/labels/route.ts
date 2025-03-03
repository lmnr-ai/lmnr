import { desc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { dateToNanoseconds } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, users } from "@/lib/db/migrations/schema";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;

  const res = await db
    .select({
      id: labels.id,
      createdAt: labels.createdAt,
      classId: labels.classId,
      spanId: labels.spanId,
      name: labelClasses.name,
      email: users.email,
    })
    .from(labels)
    .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
    .leftJoin(users, eq(labels.userId, users.id))
    .where(eq(labels.spanId, spanId))
    .orderBy(desc(labels.createdAt));

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

  const body = (await req.json()) as { reasoning?: string; classId: string; name: string };

  const [res] = await db
    .insert(labels)
    .values({
      projectId,
      classId: body.classId,
      spanId: spanId,
      userId: user.id,
      reasoning: body.reasoning,
    })
    .returning();

  if (res?.id) {
    await clickhouseClient.insert({
      table: "default.labels",
      format: "JSONEachRow",
      values: [
        {
          class_id: body.classId,
          span_id: spanId,
          id: res.id,
          name: body.name,
          project_id: projectId,
          label_source: 0,
          created_at: dateToNanoseconds(new Date()),
        },
      ],
    });
  }

  return new Response(JSON.stringify(res), { status: 200 });
}
