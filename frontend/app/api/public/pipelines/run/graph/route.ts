export async function POST(req: Request, { params }: { params: {} }): Promise<Response> {
  const body = await req.json()

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/v1/public/pipelines/run/graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('Failed to connect to external SSE server');
      return new Response('Failed to connect to external server', { status: 500 });
    }

    // Read the stream and forward it to the client
    const reader = response.body!.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      }
    });

    return new Response(stream, { headers });
  } catch (error) {
    console.error('Error connecting to external SSE:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
