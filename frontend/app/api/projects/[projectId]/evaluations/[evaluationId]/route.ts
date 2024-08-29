import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: { projectId: string, evaluationId: string } }): Promise<Response> {
    const projectId = params.projectId;
    const evaluationId = params.evaluationId;
    const session = await getServerSession(authOptions)
    const user = session!.user

    return await fetcher(`/projects/${projectId}/evaluations/${evaluationId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${user.apiKey}`
        },
    })
}

export async function DELETE(req: Request, { params }: { params: { projectId: string, evaluationId: string } }): Promise<Response> {
    const projectId = params.projectId;
    const evaluationId = params.evaluationId;
    const session = await getServerSession(authOptions)
    const user = session!.user

    return await fetcher(`/projects/${projectId}/evaluations/${evaluationId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${user.apiKey}`
        },
    })
}
