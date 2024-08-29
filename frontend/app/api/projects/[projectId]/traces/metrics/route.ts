import { authOptions } from "@/lib/auth";
import { fetcher } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: string, } }): Promise<Response> {
  const projectId = params.projectId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  return fetcher(`/projects/${projectId}/traces/metrics?` + req.nextUrl.searchParams.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}

export async function POST(req: Request, { params }: { params: { projectId: string } }): Promise<Response> {

  const projectId = params.projectId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json();
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/traces/metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })

  return new Response(res.body, { status: res.status })
}