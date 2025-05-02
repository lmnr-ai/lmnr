import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import SignUp from "@/components/auth/sign-up";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignUpPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const callbackUrl: string | undefined = Array.isArray(searchParams?.callbackUrl)
    ? searchParams.callbackUrl[0]
    : (searchParams?.callbackUrl ?? "/onboarding");

  if (session?.user) {
    const [{ count }] = await db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(membersOfWorkspaces)
      .where(eq(membersOfWorkspaces.userId, session.user.id));

    return count === 0 ? redirect("/onboarding") : redirect(callbackUrl || "/onboarding");
  }

  return (
    <SignUp
      enableCredentials={isFeatureEnabled(Feature.EMAIL_AUTH)}
      enableGithub={isFeatureEnabled(Feature.GITHUB_AUTH)}
      enableGoogle={isFeatureEnabled(Feature.GOOGLE_AUTH)}
      callbackUrl={callbackUrl}
    />
  );
}
