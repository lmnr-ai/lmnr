import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Settings from "@/components/settings/settings";
import { getProjectDetails } from "@/lib/actions/project";
import { getApiKeys } from "@/lib/actions/project-api-keys";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function ApiKeysPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }

  const [apiKeys, projectDetails] = await Promise.all([
    getApiKeys({ projectId: params.projectId }),
    getProjectDetails(params.projectId),
  ]);

  const isSubscriptionEnabled = isFeatureEnabled(Feature.SUBSCRIPTION);

  return (
    <Settings
      apiKeys={apiKeys}
      projectId={params.projectId}
      workspaceId={projectDetails.workspaceId}
      isFreeTier={isSubscriptionEnabled && projectDetails.isFreeTier}
      slackClientId={process.env.SLACK_CLIENT_ID}
      slackRedirectUri={process.env.SLACK_REDIRECT_URL}
    />
  );
}
