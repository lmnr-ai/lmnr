// Plain-language descriptions of the MCP OAuth scopes (see MCP_OAUTH_SCOPES in lib/auth.ts).
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name and profile picture",
  email: "See your email address",
  offline_access: "Stay connected without asking you to sign in again",
};
