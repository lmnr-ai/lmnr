import { getIssuer } from "@/lib/oauth/jwt";

export async function GET(): Promise<Response> {
  const issuer = getIssuer();
  const body = {
    issuer,
    device_authorization_endpoint: `${issuer}/oauth/device/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/oauth/jwks`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    response_types_supported: [],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["projects:rw"],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
    },
  });
}
