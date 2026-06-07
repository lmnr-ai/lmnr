import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import CliLoginClient from "@/components/cli-login";
import CliLoginError from "@/components/cli-login/error-panel";
import { listAccessibleWorkspaces } from "@/lib/actions/workspaces";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Authorize CLI - Laminar",
  description: "Authorize the Laminar CLI to access your account.",
};

interface CliLoginPageProps {
  searchParams?: Promise<{ port?: string; state?: string; code_challenge?: string; manual?: string }>;
}

export default async function CliLoginPage(props: CliLoginPageProps) {
  const session = await getServerSession(authOptions);
  const sp = (await props.searchParams) ?? {};
  const manual = sp.manual === "1" || sp.manual === "true";

  if (!session?.user) {
    // Preserve the CLI query params so the user lands back here after sign-in.
    const params = new URLSearchParams();
    if (sp.port) params.set("port", sp.port);
    if (sp.state) params.set("state", sp.state);
    if (sp.code_challenge) params.set("code_challenge", sp.code_challenge);
    if (sp.manual) params.set("manual", sp.manual);
    const callback = `/cli-login${params.toString() ? `?${params.toString()}` : ""}`;
    return redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  // PKCE mode needs port + state + code_challenge; manual mode needs none.
  const hasPkceParams = Boolean(sp.port && sp.state && sp.code_challenge);
  if (!manual && !hasPkceParams) {
    return <CliLoginError reason="missing-params" />;
  }

  const workspaces = await listAccessibleWorkspaces(session.user.id);

  return (
    <CliLoginClient
      userEmail={session.user.email ?? ""}
      workspaces={workspaces}
      port={sp.port ?? null}
      state={sp.state ?? null}
      codeChallenge={sp.code_challenge ?? null}
      manual={manual}
    />
  );
}
