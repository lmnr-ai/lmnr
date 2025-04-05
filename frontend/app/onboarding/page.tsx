import { eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import CreateFirstWorkspaceAndProject from '@/components/onboarding/create-first-workspace-and-project';
import OnboardingHeader from '@/components/onboarding/onboarding-header';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { users, userUsage } from '@/lib/db/migrations/schema';

export const metadata: Metadata = {
  title: 'Create workspace and project'
};

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }
  if (!session.user.isNewUserCreated) {
    // TODO: once we move user creation to next, consolidate this logic
    const userId = (await db.query.users.findFirst({
      where: eq(users.email, session.user.email!)
    }))?.id;
    if (userId) {
      db.insert(userUsage).values({
        userId,
      });
    }
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
