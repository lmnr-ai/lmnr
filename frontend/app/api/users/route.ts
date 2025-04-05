import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const email = session.user.email;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email!),
    with: {
      userSubscriptionTier: true,
    },
  });

  return new Response(JSON.stringify(user));
}
