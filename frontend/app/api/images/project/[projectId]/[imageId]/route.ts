// temporarily redirect to /api/projects/[projectId]/images/[imageId]
// while we still have images written with this old format
export async function GET(
  req: Request,
  { params }: { params: { projectId: string; imageId: string } }
): Promise<Response> {
  return Response.redirect(
    new URL(`/api/projects/${params.projectId}/images/${params.imageId}`, req.url)
  );
}
