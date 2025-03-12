import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";

export async function POST(req: Request) {
  const body = await req.json();
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const response = await fetcher("/agent/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      stream: true,
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

export const dynamic = "force-dynamic";
