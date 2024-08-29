import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";

export async function GET(req: Request, { params }: { params: { projectId: string, messageId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const messageId = params.messageId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  return fetcher(`/projects/${projectId}/trace-messages/${messageId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}