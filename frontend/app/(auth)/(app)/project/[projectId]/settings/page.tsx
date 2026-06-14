import { redirect } from "next/navigation";

import { getProjectDetails } from "@/lib/actions/project";

// Legacy /project/[projectId]/settings URLs now live under the shared /settings page.
export default async function ProjectSettingsRedirect(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const section = searchParams.tab || "general";
  const projectDetails = await getProjectDetails(params.projectId);
  return redirect(`/settings/${projectDetails.workspaceId}/${params.projectId}?section=${section}`);
}
