import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { type NextRequest } from 'next/server'
import { fetcher } from '@/lib/utils'

export async function POST(req: NextRequest): Promise<Response> {

  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()

  return await fetcher(`/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })
}
