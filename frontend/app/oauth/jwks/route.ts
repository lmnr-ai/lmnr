import { getAllPublicJwks } from "@/lib/oauth/signing-key";

export async function GET(): Promise<Response> {
  try {
    const keys = await getAllPublicJwks();
    return new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=600",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("Failed to load JWKS:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
