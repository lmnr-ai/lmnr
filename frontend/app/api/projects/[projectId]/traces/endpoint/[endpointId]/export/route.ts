import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";

export async function POST(req: Request, { params }: { params: { projectId: string, endpointId: string } }): Promise<Response> {

  const projectId = params.projectId;
  const endpointId = params.endpointId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetcher(`/projects/${projectId}/traces/endpoint/${endpointId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}
