import { fetcherRealTime } from "@/lib/utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    // Use the request's signal to detect client disconnection
    const abortController = new AbortController();

    // Forward the client's abort signal to our controller
    if (request.signal) {
      request.signal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    // Forward the request to the app-server SSE endpoint
    const response = await fetcherRealTime(`/projects/${projectId}/realtime`, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("Failed to connect to realtime service", response.status);
      return new Response("Failed to connect to realtime service", { status: 500 });
    }

    // Create a ReadableStream that properly handles client disconnection
    const stream = new ReadableStream({
      start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }

        const reader = response.body.getReader();

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                console.log(`Stream ended for project ${projectId}`);
                controller.close();
                break;
              }

              controller.enqueue(value);
            }
          } catch (error) {
            controller.error(error);
          } finally {
            // Ensure reader is released
            reader.releaseLock();
          }
        };

        pump();
      },
      cancel() {
        abortController.abort();
      }
    });

    return new Response(stream, {
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
