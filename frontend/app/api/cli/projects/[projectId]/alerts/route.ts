import { type NextRequest } from "next/server";

import { cliAlertErrorResponse, createCliAlert } from "@/lib/actions/alerts/cli";
import { authorizeCliProject } from "@/lib/auth-cli";

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    const auth = await authorizeCliProject(request, projectId);
    if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
    const alert = await createCliAlert({ projectId, userEmail: auth.user.email }, await request.json());
    return Response.json(alert);
  } catch (error) {
    return cliAlertErrorResponse(error);
  }
}
