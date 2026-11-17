import { deleteView, updateView } from "@/lib/actions/view";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

type Params = { projectId: string; viewId: string };

const REASON = "CLI writes forwarded by app-server, which audits the originating /v1 call";

export const PATCH = handlerNoAudit(
  REASON,
  internalApiHandler<Params>(async (request, { params }) => {
    const body = await request.json();
    return Response.json(
      await updateView({
        projectId: params.projectId,
        viewId: params.viewId,
        name: body.name,
        config: body.config,
        configMode: "merge",
        isDefault: body.isDefault,
      })
    );
  })
);

export const DELETE = handlerNoAudit(
  REASON,
  internalApiHandler<Params>(async (_request, { params }) => {
    await deleteView({ projectId: params.projectId, viewId: params.viewId });
    return Response.json({ id: params.viewId, deleted: true });
  })
);
