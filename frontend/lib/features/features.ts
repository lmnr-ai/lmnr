export const enum Feature {
  SEND_EMAIL = "SEND_EMAIL",
  GITHUB_AUTH = "GITHUB_AUTH",
  GOOGLE_AUTH = "GOOGLE_AUTH",
  AZURE_AUTH = "AZURE_AUTH",
  EMAIL_AUTH = "EMAIL_AUTH",
  WORKSPACE = "WORKSPACE",
  POSTHOG = "POSTHOG",
  LOCAL_DB = "LOCAL_DB",
  FULL_BUILD = "FULL_BUILD",
  SUBSCRIPTION = "SUBSCRIPTION",
  SLACK = "SLACK",
  LANDING = "LANDING",
  PATTERNS = "PATTERNS",
  SEMANTIC_EVENTS = "SEMANTIC_EVENTS",
}

// right now all managed-version features are disabled in local environment
export const isFeatureEnabled = (feature: Feature) => {
  if (feature === Feature.LANDING) {
    return process.env.ENVIRONMENT === "PRODUCTION" ? true : false;
  }

  if (feature === Feature.PATTERNS) {
    return process.env.ENVIRONMENT === "PRODUCTION";
  }

  if (feature === Feature.EMAIL_AUTH) {
    return process.env.ENVIRONMENT !== "PRODUCTION";
  }

  if (feature === Feature.LOCAL_DB) {
    return process.env.ENVIRONMENT !== "PRODUCTION" || process.env.FORCE_RUN_MIGRATIONS === "true";
  }

  if (feature === Feature.GITHUB_AUTH) {
    return !!process.env.AUTH_GITHUB_ID && !!process.env.AUTH_GITHUB_SECRET;
  }

  if (feature === Feature.AZURE_AUTH) {
    return (
      !!process.env.AUTH_AZURE_AD_CLIENT_ID &&
      !!process.env.AUTH_AZURE_AD_CLIENT_SECRET &&
      !!process.env.AUTH_AZURE_AD_TENANT_ID
    );
  }

  if (feature === Feature.FULL_BUILD) {
    const environment = process.env.ENVIRONMENT;
    if (!environment) {
      throw new Error("ENVIRONMENT is not set");
    }
    return ["FULL", "PRODUCTION"].includes(environment);
  }

  if (feature === Feature.SUBSCRIPTION) {
    return process.env.ENVIRONMENT === "PRODUCTION" && !!process.env.STRIPE_SECRET_KEY;
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

  if (feature === Feature.SEMANTIC_EVENTS) {
    return process.env.ENVIRONMENT === "PRODUCTION";
  }

  return process.env.ENVIRONMENT === "PRODUCTION";
};
