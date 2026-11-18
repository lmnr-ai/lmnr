import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { auth, MCP_RESOURCE_URL } from "@/lib/auth";

// OIDC discovery in RFC 8414 path-insertion form for the issuer `<origin>/api/auth`.
const metadata = oauthProviderOpenIdConfigMetadata(auth, { headers: { "Access-Control-Allow-Origin": "*" } });

export const GET = (req: Request) => (MCP_RESOURCE_URL ? metadata(req) : new Response(null, { status: 404 }));
