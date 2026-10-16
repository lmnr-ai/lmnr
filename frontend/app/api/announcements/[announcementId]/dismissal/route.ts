import { z } from "zod";

import { dismissAnnouncement, isUnknownAnnouncement } from "@/lib/announcements/server";
import { getServerSession } from "@/lib/auth-session";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const ParamsSchema = z.object({
  announcementId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export async function PUT(_request: Request, { params }: { params: Promise<{ announcementId: string }> }) {
  try {
    if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const session = await getServerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { announcementId } = ParamsSchema.parse(await params);
    // A positively missing id is a successful no-op: the stale card stays hidden
    // in this UI session without storing junk in preferences. Strapi outages fail
    // open so a previously rendered real announcement can still be persisted.
    if (await isUnknownAnnouncement(announcementId)) {
      return Response.json({ ok: true, persisted: false });
    }

    await dismissAnnouncement(session.user.id, announcementId);
    return Response.json({ ok: true, persisted: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: z.prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
