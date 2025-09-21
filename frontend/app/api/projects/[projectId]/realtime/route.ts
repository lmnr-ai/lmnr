export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = await params;

  try {
    // Forward the request to the app-server SSE endpoint
    const appServerUrl = process.env.APP_SERVER_URL || "http://localhost:8000";
    const response = await fetch(`${appServerUrl}/api/v1/projects/${projectId}/realtime`, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

    if (!response.ok) {
      console.error("Failed to connect to realtime service", response);
      return new Response("Failed to connect to realtime service", { status: 500 });
    }

    // Return the SSE stream
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    console.error("Error connecting to realtime service:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
