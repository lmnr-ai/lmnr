import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: { workspaceId: string } }): Promise<Response> {
    const session = await getServerSession(authOptions)
    const user = session!.user

    const body = await req.json()
    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/workspaces/${params.workspaceId}/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.apiKey}`
        },
        body: JSON.stringify(body)
    })

    return new Response(res.body, { status: res.status })
}