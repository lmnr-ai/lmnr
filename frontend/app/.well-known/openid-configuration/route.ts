import { buildAuthorizationServerMetadata, metadataResponse } from "@/lib/oauth/metadata";

// Back-compat alias for already-shipped CLIs and openid-client default
// discovery. Canonical location for OAuth-only servers is RFC 8414 at
// `/.well-known/oauth-authorization-server`.
export async function GET(): Promise<Response> {
  return metadataResponse(buildAuthorizationServerMetadata());
}
