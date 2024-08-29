import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: { projectId: string } }): Promise<Response> {
    const projectId = params.projectId;
    const session = await getServerSession(authOptions)
    const user = session!.user

    return await fetcher(`/projects/${projectId}/evaluations`, {
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
    const body = await req.json()

    return await fetcher(`/projects/${projectId}/evaluations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.apiKey}`
        },
        body: JSON.stringify(body)
    })
}
