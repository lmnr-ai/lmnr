import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcherJSON } from "@/lib/utils";
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Settings from '@/components/settings/settings';

export const metadata: Metadata = {
  title: 'Settings',
}


const getProjectApiKeys = async (projectId: string) => {
  const session = await getServerSession(authOptions)
  const user = session!.user
  const res = await fetcherJSON(`/projects/${projectId}/api-keys`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  });
  return await res
}

export default async function ApiKeysPage(
  { params }: { params: { projectId: string } }
) {
  const apiKeys = await getProjectApiKeys(params.projectId)

  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <>
      <Settings apiKeys={apiKeys} />
    </>
  )
}
