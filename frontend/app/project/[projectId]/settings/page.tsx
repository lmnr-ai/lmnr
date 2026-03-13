import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Settings from "@/components/settings/settings";
import { getApiKeys } from "@/lib/actions/project-api-keys";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function ApiKeysPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }

  const apiKeys = await getApiKeys({ projectId: params.projectId }).catch((e) => {
    console.error("Failed to load API keys:", e);
    throw new Error("Failed to load API keys");
  });

  return (
    <Settings
      slackClientId={process.env.SLACK_CLIENT_ID}
      slackRedirectUri={process.env.SLACK_REDIRECT_URL}
      apiKeys={apiKeys}
    />
  );
}
