import { deleteRenderTemplate, getRenderTemplate, updateRenderTemplate } from "@/lib/actions/render-template";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; templateId: string }, unknown>(
  async (_req, params) =>
    await getRenderTemplate({
      projectId: params.projectId,
      templateId: params.templateId,
    })
);

export const PUT = handleRoute<{ projectId: string; templateId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await updateRenderTemplate({
    projectId: params.projectId,
    templateId: params.templateId,
    name: body.name,
    code: body.code,
  });
});

export const DELETE = handleRoute<{ projectId: string; templateId: string }, unknown>(
  async (_req, params) =>
    await deleteRenderTemplate({
      projectId: params.projectId,
      templateId: params.templateId,
    })
);
