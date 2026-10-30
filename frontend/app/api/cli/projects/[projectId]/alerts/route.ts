import { type NextRequest } from "next/server";

import { cliAlertErrorResponse, createCliAlert, listCliAlerts } from "@/lib/actions/alerts/cli";
import { authorizeCliProject } from "@/lib/auth-cli";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    const auth = await authorizeCliProject(request, projectId);
    if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
    const signalId = request.nextUrl.searchParams.get("signalId") ?? undefined;
    const alerts = await listCliAlerts({ projectId, userEmail: auth.user.email }, signalId);
    return Response.json({ alerts });
  } catch (error) {
    return cliAlertErrorResponse(error);
  }
}

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
