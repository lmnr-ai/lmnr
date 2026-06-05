import { buildAuthorizationServerMetadata, metadataResponse } from "@/lib/oauth/metadata";

// RFC 8414: OAuth 2.0 authorization-server metadata
export async function GET(): Promise<Response> {
  return metadataResponse(buildAuthorizationServerMetadata());
}
