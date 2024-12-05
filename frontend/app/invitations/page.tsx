import { eq } from 'drizzle-orm';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { revalidatePath } from 'next/cache';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import noise from '@/assets/landing/noise.jpeg';
import logo from '@/assets/logo/logo.svg';
import { Button } from '@/components/ui/button';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { apiKeys, membersOfWorkspaces, workspaces } from '@/lib/db/migrations/schema';

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
    return redirect(`/sign-in?callbackUrl=/invitations?token=${searchParams?.token}`);
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

  // // check if current user is already a member of the workspace
  // const member = await db.select({ count: count() })
  //   .from(membersOfWorkspaces)
  //   .innerJoin(apiKeys, eq(membersOfWorkspaces.userId, apiKeys.userId))
  //   .where(and(
  //     eq(apiKeys.apiKey, user.apiKey),
  //     eq(membersOfWorkspaces.workspaceId, decoded.workspaceId)
  //   ));

  // if (member[0].count > 0) {
  //   return redirect('/projects');
  // }

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
          <h2 className="text-lg font-medium mb-8">
            You are invited to join <b>{workspace.name}</b>
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

              await db.insert(membersOfWorkspaces).values({
                userId: row.userId,
                workspaceId: decoded.workspaceId,
                memberRole: 'member'
              });

              revalidatePath('/projects');
              redirect('/projects');
            }}>
              <Button
                variant="light"
                size="lg"
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
                size="lg"
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
