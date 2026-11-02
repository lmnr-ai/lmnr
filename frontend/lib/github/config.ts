// App-level credentials of the Laminar GitHub App. Per-customer state is only an installation_id.
export const GITHUB_APP_ENV_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_WEBHOOK_SECRET",
  "GITHUB_STATE_SECRET",
] as const;

function requireEnv(name: (typeof GITHUB_APP_ENV_VARS)[number]): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export const githubAppConfig = {
  clientId: () => requireEnv("GITHUB_APP_CLIENT_ID"),
  clientSecret: () => requireEnv("GITHUB_APP_CLIENT_SECRET"),
  slug: () => requireEnv("GITHUB_APP_SLUG"),
  // Stored base64-encoded: multi-line PEMs don't survive most env var tooling.
  privateKey: () => Buffer.from(requireEnv("GITHUB_APP_PRIVATE_KEY"), "base64").toString("utf8"),
  webhookSecret: () => requireEnv("GITHUB_APP_WEBHOOK_SECRET"),
  stateSecret: () => requireEnv("GITHUB_STATE_SECRET"),
};
