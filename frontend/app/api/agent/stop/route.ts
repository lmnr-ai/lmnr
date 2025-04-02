import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";

export async function POST(req: Request) {
  const body = (await req.json()) as { sessionId: string };
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const response = await fetcher("/agent/stop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return new Response(response.body);
}
