import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';

export async function GET(): Promise<Response> {

  const session = await getServerSession(authOptions)
  const user = session!.user

  return await fetcher(`/limits/user/storage`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}
