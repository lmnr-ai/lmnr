import { getServerSession } from 'next-auth';
import { GitHubSignInButton } from '@/components/sign-in/github-signin';
import logo from '@/assets/logo/logo.svg';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/sign-in/google-signin';
import { notFound, redirect } from 'next/navigation';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { EmailSignInButton } from '@/components/sign-in/email-signin';
import noise from '@/assets/landing/noise.jpeg';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { db } from '@/lib/db/drizzle';
import { and, count, eq } from 'drizzle-orm';
import { workspaces, membersOfWorkspaces, apiKeys } from '@/lib/db/migrations/schema';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export default async function SignInPage({
  params,
  searchParams
}: {
  params: {};
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user) {
    return redirect(`/signin?callbackUrl=/invitations?token=${searchParams?.token}`);
  }

  const token = searchParams?.token as string;

  if (!token) {
    return notFound();
  }

  let decoded: JwtPayload;

  try {
    decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JwtPayload;
  } catch (error) {
    return notFound();
  }

  // check if current user is already a member of the workspace
  const member = await db.select({ count: count() })
    .from(membersOfWorkspaces)
    .innerJoin(apiKeys, eq(membersOfWorkspaces.userId, apiKeys.userId))
    .where(and(
      eq(apiKeys.apiKey, user.apiKey),
      eq(membersOfWorkspaces.workspaceId, decoded.workspaceId)
    ));

  if (member[0].count > 0) {
    return redirect('/projects');
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, decoded.workspaceId)
  });

  if (!workspace) {
    return notFound();
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center relative">
        <div className="inset-0 absolute z-10 rounded-lg overflow-hidden">
          <Image src={noise} alt="" className="w-full h-full" priority />
        </div>
        <div className="z-20 flex flex-col items-center p-16 px-8">
          <Image alt="" src={logo} width={220} className="my-16" />
          <h2 className="text-xl mb-8">
            You are invited to join {workspace.name}
          </h2>
          <div className="flex gap-4">
            <form action={async () => {
              'use server';

              const row = await db.query.apiKeys.findFirst({
                where: eq(apiKeys.apiKey, user.apiKey)
              });

              if (!row) {
                return notFound();
              }

              await fetcher(`/api/workspaces/${decoded.workspaceId}/users`, {
                method: 'POST',
                body: JSON.stringify({
                  email: user.email,
                })
              });

              revalidatePath('/projects');
              redirect('/projects');
            }}>
              <Button
                variant="light"
              >
                Accept
              </Button>
            </form>
            <form action={async () => {
              'use server';
              redirect('/projects');
            }}>
              <Button
                variant="lightSecondary"
              >
                Decline
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
