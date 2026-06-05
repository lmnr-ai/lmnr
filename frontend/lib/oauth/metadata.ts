import { getIssuer } from "@/lib/oauth/jwt";

/**
 * Authorization-server metadata, RFC 8414-shaped. Served at both
 * `/.well-known/oauth-authorization-server` (the canonical RFC 8414 location
 * for OAuth-only providers) and `/.well-known/openid-configuration` (kept for
 * back-compat with already-shipped CLIs and openid-client default discovery).
 *
 * We intentionally omit `authorization_endpoint`: per RFC 8414 §2 it is
 * REQUIRED only when grant types are supported that use the authorization
 * endpoint (Auth Code / Implicit). We only do Device Flow + Refresh, so
 * omitting it is correct.
 */
export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  token_endpoint: string;
  jwks_uri: string;
  device_authorization_endpoint: string;
  revocation_endpoint: string;
  revocation_endpoint_auth_methods_supported: string[];
  grant_types_supported: string[];
  response_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  id_token_signing_alg_values_supported: string[];
}

export function buildAuthorizationServerMetadata(): OAuthAuthorizationServerMetadata {
  const issuer = getIssuer();
  return {
    issuer,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/oauth/jwks`,
    device_authorization_endpoint: `${issuer}/oauth/device/authorize`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"],
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    response_types_supported: [],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["projects:rw"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
}

export function metadataResponse(body: OAuthAuthorizationServerMetadata): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
    },
  });
}
