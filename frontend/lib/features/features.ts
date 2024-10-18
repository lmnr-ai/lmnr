export const enum Feature {
  SEND_EMAIL = 'SEND_EMAIL',
  GITHUB_AUTH = 'GITHUB_AUTH',
  GOOGLE_AUTH = 'GOOGLE_AUTH',
  EMAIL_AUTH = 'EMAIL_AUTH',
  WORKSPACE = 'WORKSPACE',
  SUPABASE = 'SUPABASE',
  POSTHOG = 'POSTHOG'
}

// right now all managed-version features are disabled in local environment
export const isFeatureEnabled = (feature: Feature) => {
  if (feature === Feature.EMAIL_AUTH) {
    return process.env.ENVIRONMENT === 'PRODUCTION' ? false : true;
  }

  return process.env.ENVIRONMENT === 'PRODUCTION' ? true : false;
};
