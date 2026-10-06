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
    // Only reject ids Strapi positively says it does not have — a CMS outage
    // would otherwise make an already-rendered card impossible to dismiss. The
    // id shape is validated above and the stored list is capped server-side.
    if (await isUnknownAnnouncement(announcementId)) {
      return Response.json({ error: "Announcement not found" }, { status: 404 });
    }

    await dismissAnnouncement(session.user.id, announcementId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: z.prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
