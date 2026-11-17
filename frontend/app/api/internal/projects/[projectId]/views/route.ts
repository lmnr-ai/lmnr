import { createView } from "@/lib/actions/view";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1 call",
  internalApiHandler<{ projectId: string }>(async (request, { params }) => {
    const body = await request.json();
    return Response.json(
      await createView({
        projectId: params.projectId,
        resource: body.resource,
        name: body.name,
        config: body.config ?? {},
        isDefault: body.isDefault,
      })
    );
  })
);
