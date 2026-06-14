import { redirect } from "next/navigation";

import { getProjectDetails } from "@/lib/actions/project";

// Legacy /project/[projectId]/settings URLs now live under the shared /settings page.
export default async function ProjectSettingsRedirect(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const section = typeof searchParams.tab === "string" ? searchParams.tab : "general";

  // Preserve every other query param (e.g. Slack OAuth's ?slack=success|error).
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => rest.append(key, v));
    } else {
      rest.append(key, value);
    }
  }
  rest.set("section", section);

  const projectDetails = await getProjectDetails(params.projectId);
  return redirect(`/settings/${projectDetails.workspaceId}/${params.projectId}?${rest.toString()}`);
}
