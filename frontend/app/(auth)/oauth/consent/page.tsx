import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { OAuthConsent } from "@/components/auth/oauth-consent";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Authorize application access - Laminar",
  description: "Authorize an OAuth client to access Laminar on your behalf.",
};

interface ConsentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const params = await searchParams;
  const session = await getServerSession();
  const oauthQuery = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") oauthQuery.set(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => oauthQuery.append(key, entry));
  }

  if (!session?.user) {
    const callbackUrl = `/oauth/consent?${oauthQuery.toString()}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const clientName = typeof params.client_name === "string" ? params.client_name : "OAuth client";
  const requestedScopes = typeof params.scope === "string" ? params.scope.split(" ").filter(Boolean) : [];

  return (
    <OAuthConsent
      clientName={clientName}
      oauthQuery={oauthQuery.toString()}
      requestedScopes={requestedScopes}
      userEmail={session.user.email}
    />
  );
}
