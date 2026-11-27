import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth, MCP_RESOURCE_URL } from "@/lib/auth";

// RFC 8414 path-insertion form for the issuer `<origin>/api/auth`, which MCP clients try
// first. `<issuer>/.well-known/*` is served by the Better Auth catch-all route.
const metadata = oauthProviderAuthServerMetadata(auth, { headers: { "Access-Control-Allow-Origin": "*" } });

export const GET = (req: Request) => (MCP_RESOURCE_URL ? metadata(req) : new Response(null, { status: 404 }));
