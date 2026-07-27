import { fetcherRealTime } from "@/lib/utils";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    // Use the request's signal to detect client disconnection
    const abortController = new AbortController();

    // Forward the client's abort signal to our controller
    if (request.signal) {
      request.signal.addEventListener("abort", () => {
        abortController.abort();
      });
    }

    // Parse query parameters from the incoming request
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "traces"; // Default to 'traces'

    // Build query string for app-server
    const queryParams = new URLSearchParams();
    queryParams.set("key", key);

    const queryString = queryParams.toString();
    const endpoint = `/projects/${projectId}/realtime?${queryString}`;

    // Forward the request to the app-server SSE endpoint
    const response = await fetcherRealTime(endpoint, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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

        // Ending the stream is always graceful, never `controller.error`: Next's
        // `pipeToNodeResponse` rethrows any non-abort stream error as
        // "failed to pipe response", which `onRequestError` reports to Sentry.
        // Every way this stream can break is a normal connection lifecycle event
        // (app-server pod rolled, client navigated away), and closing lets the
        // browser's EventSource reconnect on its own.
        const endStream = () => {
          try {
            controller.close();
          } catch {
            // Already closed or cancelled by the client.
          }
        };

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              controller.enqueue(value);
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              // Upstream went away mid-stream (pod rollout, idle timeout).
              console.warn(`Realtime stream for project ${projectId} ended early:`, error);
            }
          } finally {
            reader.releaseLock();
            endStream();
          }
        };

        pump();
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    if (request.signal?.aborted) {
      // Client hung up before the upstream connection was established. Nothing
      // to report and nobody to report it to.
      return new Response(null, { status: 499 });
    }
    console.error("Error connecting to realtime service:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
