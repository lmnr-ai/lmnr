// temporarily redirect to /api/projects/[projectId]/images/[imageId]
// while we still have images written with this old format
export async function GET(
  req: Request,
  props: {
    params: Promise<{ projectId: string; imageId: string }>,
    searchParams: Promise<{ payloadType: string }>
  }
): Promise<Response> {
  const params = await props.params;
  const searchParams = await props.searchParams;
  return Response.redirect(
    new URL(`/api/projects/${params.projectId}/images/${params.imageId}?payloadType=${searchParams.payloadType}`, req.url)
  );
}
