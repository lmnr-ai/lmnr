import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";

export async function POST(req: Request, { params }: { params: { projectId: string, datasetId: string, datapointId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const datapointId = params.datapointId;
  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()

  return await fetcher(`/projects/${projectId}/datasets/${datasetId}/datapoints/${datapointId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })
}
