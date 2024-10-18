import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { UserContextProvider } from '@/contexts/user-context';
import { Metadata } from 'next';
import OnboardingHeader from '@/components/onboarding/onboarding-header';
import CreateFirstWorkspaceAndProject from '@/components/onboarding/create-first-workspace-and-project';

export const metadata: Metadata = {
  title: 'Create workspace and project'
};

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }
  if (!session.user.isNewUserCreated) {
    redirect('/projects');
  }
  const user = session.user;

  return (
    <UserContextProvider
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <div className="flex flex-col h-full w-full">
        <OnboardingHeader />
        <CreateFirstWorkspaceAndProject name={user.name} />
      </div>
    </UserContextProvider>
  );
}
