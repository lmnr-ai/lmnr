import { fetcher } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await fetcher("/agent/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        stream: true,
      }),
    });

    // Simply forward the stream
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Internal server error.",
        details: e instanceof Error ? e.name : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export const dynamic = "force-dynamic";
