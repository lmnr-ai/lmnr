import { cancelSubscription } from "@/lib/actions/checkout";
import { type CancellationReason } from "@/lib/actions/checkout/types";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, Awaited<ReturnType<typeof cancelSubscription>>>(
  async (req, { workspaceId }) => {
    const body = await req.json().catch(() => ({}));
    const reason = (body.reason as CancellationReason) ?? "other";
    const comment = typeof body.comment === "string" ? body.comment : "";

    return cancelSubscription(workspaceId, reason, comment);
  }
);
