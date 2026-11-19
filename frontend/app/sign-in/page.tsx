import { type Metadata } from "next";
import { redirect } from "next/navigation";

import SignIn from "@/components/auth/sign-in";
import { getVerifiedOAuthQuery } from "@/lib/auth-oauth-query";
import { getServerSession } from "@/lib/auth-session";
import { oauthResumeUrl } from "@/lib/oauth-resume-url";
import { sanitizeCallbackUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign In - Laminar",
  description: "Sign in to your Laminar account.",
};

export default async function SignInPage(props: {
  params: Promise<Record<string, never>>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  // An MCP client's authorization request (signed by the OAuth provider). The provider
  // sends signed-in users here too for prompt=login / max_age, so don't skip the form.
  const oauthQuery = await getVerifiedOAuthQuery(searchParams);

  const session = await getServerSession();
  if (session && !oauthQuery) {
    redirect("/projects");
  }

  const callbackUrl = oauthQuery ? oauthResumeUrl(oauthQuery) : sanitizeCallbackUrl(searchParams?.callbackUrl);

  return <SignIn callbackUrl={callbackUrl} />;
}
