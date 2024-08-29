import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";

export async function GET(req: Request, { params }: { params: { projectId: string, traceId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const traceId = params.traceId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  return fetcher(`/projects/${projectId}/traces/${traceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}