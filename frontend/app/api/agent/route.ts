import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { fetcher } from "@/lib/utils";

export async function POST(req: Request) {
  const body = await req.json();
  const session = await getServerSession(authOptions);
  const user = session!.user;

  // Quick fix to get the user id from the api key
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, user.email!),
  });
  if (!dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = dbUser.id;

  const response = await fetcher("/agent/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      stream: true,
      userId,
    }),
  });

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
