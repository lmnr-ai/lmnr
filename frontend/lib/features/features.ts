export enum Feature {
  SEND_EMAIL = "SEND_EMAIL",
  GITHUB_AUTH = "GITHUB_AUTH",
  GOOGLE_AUTH = "GOOGLE_AUTH",
  AZURE_AUTH = "AZURE_AUTH",
  OKTA_AUTH = "OKTA_AUTH",
  KEYCLOAK_AUTH = "KEYCLOAK_AUTH",
  EMAIL_AUTH = "EMAIL_AUTH",
  POSTHOG = "POSTHOG",
  LOCAL_DB = "LOCAL_DB",
  FULL_BUILD = "FULL_BUILD",
  SUBSCRIPTION = "SUBSCRIPTION",
  DEPLOYMENT = "DEPLOYMENT",
  SIGNALS = "SIGNALS",
  BATCH_SIGNALS = "BATCH_SIGNALS",
  SLACK = "SLACK",
  LANDING = "LANDING",
}

const AUTH_PROVIDER_FEATURES = [
  Feature.GITHUB_AUTH,
  Feature.GOOGLE_AUTH,
  Feature.AZURE_AUTH,
  Feature.OKTA_AUTH,
  Feature.KEYCLOAK_AUTH,
];

// right now all managed-version features are disabled in local environment
export const isFeatureEnabled = (feature: Feature): boolean => {
  if (feature === Feature.LANDING) {
    return process.env.ENVIRONMENT === "PRODUCTION" ? true : false;
  }

  if (feature === Feature.EMAIL_AUTH) {
    if (process.env.FORCE_EMAIL_AUTH === "true") {
      return true;
    }
    if (process.env.ENVIRONMENT === "PRODUCTION") {
      return false;
    }
    // In self-hosted mode, hide the dummy email input when a real auth provider is configured
    return !AUTH_PROVIDER_FEATURES.some((f) => isFeatureEnabled(f));
  }

  if (feature === Feature.LOCAL_DB) {
    return process.env.ENVIRONMENT !== "PRODUCTION" || process.env.FORCE_RUN_MIGRATIONS === "true";
  }

  if (feature === Feature.GITHUB_AUTH) {
    return !!process.env.AUTH_GITHUB_ID && !!process.env.AUTH_GITHUB_SECRET;
  }

  if (feature === Feature.GOOGLE_AUTH) {
    return !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  }

  if (feature === Feature.AZURE_AUTH) {
    return (
      !!process.env.AUTH_AZURE_AD_CLIENT_ID &&
      !!process.env.AUTH_AZURE_AD_CLIENT_SECRET &&
      !!process.env.AUTH_AZURE_AD_TENANT_ID
    );
  }

  if (feature === Feature.OKTA_AUTH) {
    return !!process.env.AUTH_OKTA_CLIENT_ID && !!process.env.AUTH_OKTA_CLIENT_SECRET && !!process.env.AUTH_OKTA_ISSUER;
  }

  if (feature === Feature.KEYCLOAK_AUTH) {
    return !!process.env.AUTH_KEYCLOAK_ID && !!process.env.AUTH_KEYCLOAK_SECRET && !!process.env.AUTH_KEYCLOAK_ISSUER;
  }

  if (feature === Feature.FULL_BUILD) {
    const environment = process.env.ENVIRONMENT;
    return !!environment && ["FULL", "PRODUCTION"].includes(environment);
  }

  if (feature === Feature.SUBSCRIPTION) {
    return process.env.LAMINAR_CLOUD === "true";
  }

  if (feature === Feature.DEPLOYMENT) {
    return process.env.LAMINAR_CLOUD === "true";
  }

  if (feature === Feature.SIGNALS) {
    return (
      !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      (process.env.BEDROCK_ENABLED === "true" &&
        !!process.env.AWS_ACCESS_KEY_ID &&
        !!process.env.AWS_SECRET_ACCESS_KEY &&
        !!process.env.AWS_REGION)
    );
  }

  if (feature === Feature.BATCH_SIGNALS) {
    return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }

  if (feature === Feature.SEND_EMAIL) {
    return !!process.env.RESEND_API_KEY;
  }

  if (feature === Feature.SLACK) {
    return (
      process.env.ENVIRONMENT === "PRODUCTION" &&
      !!process.env.SLACK_CLIENT_ID &&
      !!process.env.SLACK_CLIENT_SECRET &&
      !!process.env.SLACK_SIGNING_SECRET &&
      !!process.env.SLACK_REDIRECT_URL
    );
  }

  if (feature === Feature.POSTHOG) {
    return process.env.POSTHOG_TELEMETRY === "true";
  }

  return process.env.ENVIRONMENT === "PRODUCTION";
};
