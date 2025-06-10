import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import SignIn from "@/components/auth/sign-in";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignInPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  let callbackUrl: string | undefined = Array.isArray(searchParams?.callbackUrl)
    ? searchParams.callbackUrl[0]
    : (searchParams?.callbackUrl ?? "/onboarding");

  if (callbackUrl) {
    try {
      const url = new URL(callbackUrl);
      const currentOrigin = process.env.NEXTAUTH_URL;
      if (url.origin === currentOrigin && (url.pathname === "/" || url.pathname === "")) {
        callbackUrl = "/onboarding";
      }
    } catch {
      callbackUrl = "/onboarding";
    }
  }

  if (session?.user) {
    const [{ count }] = await db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(membersOfWorkspaces)
      .where(eq(membersOfWorkspaces.userId, session.user.id));

    return count === 0 ? redirect("/onboarding") : redirect(callbackUrl || "/onboarding");
  }

  return (
    <SignIn
      enableCredentials={isFeatureEnabled(Feature.EMAIL_AUTH)}
      enableGithub={isFeatureEnabled(Feature.GITHUB_AUTH)}
      enableGoogle={isFeatureEnabled(Feature.GOOGLE_AUTH)}
      callbackUrl={callbackUrl}
    />
  );
}
