import { createCliAlert } from "@/lib/actions/alerts/cli";
import { internalAlertRoute } from "@/lib/actions/alerts/internal-route";

export async function POST(request: Request, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  return internalAlertRoute(request, projectId, async (ctx) => createCliAlert(ctx, await request.json()));
}
