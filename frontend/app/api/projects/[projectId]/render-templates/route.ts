import { createRenderTemplate } from "@/lib/actions/render-template";
import { getRenderTemplates } from "@/lib/actions/render-templates";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) => await getRenderTemplates({ projectId: params.projectId })
);

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await createRenderTemplate({
    projectId: params.projectId,
    name: body.name,
    code: body.code,
  });
});
