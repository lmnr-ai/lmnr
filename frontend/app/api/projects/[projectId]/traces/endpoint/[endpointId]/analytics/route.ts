import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: string, endpointId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const endpointId = params.endpointId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  return fetcher(`/projects/${projectId}/traces/endpoint/${endpointId}/analytics?` + req.nextUrl.searchParams.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}
