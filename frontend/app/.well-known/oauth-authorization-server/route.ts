import { buildAuthorizationServerMetadata, metadataResponse } from "@/lib/oauth/metadata";

// RFC 8414 — canonical location for OAuth 2.0 authorization-server metadata.
// We don't ship an authorization_endpoint (RFC 8414 §2: only REQUIRED for
// grants that use it; we only do Device Flow + Refresh).
export async function GET(): Promise<Response> {
  return metadataResponse(buildAuthorizationServerMetadata());
}
