import { type Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { OAuthConsent } from "@/components/oauth-consent";
import { ConsentError } from "@/components/oauth-consent/consent-error";
import { auth, MCP_RESOURCE_URL } from "@/lib/auth";
import { getVerifiedOAuthQuery } from "@/lib/auth-oauth-query";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Authorize app - Laminar",
};

const redirectHostOf = (redirectUri: string | null): string => {
  try {
    const url = new URL(redirectUri ?? "");
    return url.host || `${url.protocol}//`;
  } catch {
    return "an unknown address";
  }
};

// Consent step of the MCP OAuth flow; the OAuth provider (lib/auth.ts) redirects here
// with a signed copy of the client's authorization request.
export default async function OAuthConsentPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!MCP_RESOURCE_URL) notFound();

  const query = await getVerifiedOAuthQuery(await props.searchParams);
  if (!query) {
    return <ConsentError message="This authorization request is invalid or has expired. Start again from your app." />;
  }

  const session = await getServerSession();
  if (!session) {
    // The sign-in page verifies the same signed query and resumes the flow afterwards.
    redirect(`/sign-in?${query.toString()}`);
  }

  const client = await auth.api
    .getOAuthClientPublic({ query: { client_id: query.get("client_id") ?? "" }, headers: await headers() })
    .catch(() => null);
  if (!client) {
    return <ConsentError message="This app is not registered or has been disabled." />;
  }

  return (
    <OAuthConsent
      // Self-registered clients pick their own name, so the redirect host is shown too.
      clientName={client.client_name || "An application"}
      redirectHost={redirectHostOf(query.get("redirect_uri"))}
      scopes={query.get("scope")?.split(" ").filter(Boolean) ?? []}
      userEmail={session.user.email}
    />
  );
}
