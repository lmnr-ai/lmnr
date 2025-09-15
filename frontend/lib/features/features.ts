export const enum Feature {
  SEND_EMAIL = "SEND_EMAIL",
  GITHUB_AUTH = "GITHUB_AUTH",
  GOOGLE_AUTH = "GOOGLE_AUTH",
  AZURE_AUTH = "AZURE_AUTH",
  EMAIL_AUTH = "EMAIL_AUTH",
  WORKSPACE = "WORKSPACE",
  SUPABASE = "SUPABASE",
  POSTHOG = "POSTHOG",
  POSTHOG_IDENTIFY = "POSTHOG_IDENTIFY",
  POSTHOG_SESSION_RECORDING = "POSTHOG_SESSION_RECORDING",
  LOCAL_DB = "LOCAL_DB",
  FULL_BUILD = "FULL_BUILD",
  SUBSCRIPTION = "SUBSCRIPTION",
  LANDING = "LANDING",
}

// right now all managed-version features are disabled in local environment
export const isFeatureEnabled = (feature: Feature) => {
  if (feature === Feature.LANDING) {
    return process.env.ENVIRONMENT === "PRODUCTION" ? true : false;
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

  if (feature === Feature.POSTHOG) {
    return (
      process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === "true" ||
      process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_TELEMETRY === "true"
    );
  }

  if (feature === Feature.POSTHOG_IDENTIFY) {
    return process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_TELEMETRY === "true";
  }

  if (feature === Feature.POSTHOG_SESSION_RECORDING) {
    return process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_TELEMETRY === "true";
  }

  return process.env.ENVIRONMENT === "PRODUCTION";
};
