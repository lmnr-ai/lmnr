import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest): Promise<Response> {

  const session = await getServerSession(authOptions)
  const user = session!.user

  return await fetcher('/workspaces?' + req.nextUrl.searchParams.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()
  const res = await fetcher(`/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })

  return new Response(res.body)
}