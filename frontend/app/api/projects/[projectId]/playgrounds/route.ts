import { parseUrlParams } from "@/lib/actions/common/utils";
import { createPlayground, deletePlaygrounds, getPlaygrounds, GetPlaygroundsSchema } from "@/lib/actions/playgrounds";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);

  const parseResult = parseUrlParams(searchParams, GetPlaygroundsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getPlaygrounds({
    ...parseResult.data,
    projectId: params.projectId,
  });
});

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await createPlayground({
    projectId: params.projectId,
    name: body.name,
  });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const playgroundIds = searchParams.get("playgroundIds")?.split(",").filter(Boolean);

  if (!playgroundIds) {
    throw new Error("At least one playground id is required");
  }

  await deletePlaygrounds({
    projectId: params.projectId,
    playgroundIds,
  });

  return { message: "Playgrounds deleted successfully" };
});
