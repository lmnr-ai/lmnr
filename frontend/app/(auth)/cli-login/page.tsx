import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import CliLoginClient from "@/components/cli-login";
import CliLoginError from "@/components/cli-login/error-panel";
import { UserContextProvider } from "@/contexts/user-context";
import { getUserContext } from "@/lib/actions/cli-login";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Authorize CLI - Laminar",
  description: "Authorize the Laminar CLI to access your account.",
};

interface CliLoginPageProps {
  searchParams?: Promise<{ session_id?: string; public_key?: string }>;
}

export default async function CliLoginPage(props: CliLoginPageProps) {
  const session = await getServerSession(authOptions);
  const sp = (await props.searchParams) ?? {};

  if (!session) {
    // Preserve the CLI query params so the user lands back here after sign-in.
    const params = new URLSearchParams();
    if (sp.session_id) params.set("session_id", sp.session_id);
    if (sp.public_key) params.set("public_key", sp.public_key);
    const callback = `/cli-login${params.toString() ? `?${params.toString()}` : ""}`;
    return redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  if (!sp.session_id || !sp.public_key) {
    return <CliLoginError reason="missing-params" />;
  }

  const user = session.user;
  const ctx = await getUserContext({ userId: user.id });

  return (
    <UserContextProvider user={user}>
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
        <CliLoginClient
          sessionId={sp.session_id}
          publicKey={sp.public_key}
          user={ctx.user}
          workspaces={ctx.workspaces}
        />
      </div>
    </UserContextProvider>
  );
}
