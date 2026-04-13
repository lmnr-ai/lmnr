import posthog from "posthog-js";

const POSTHOG_KEY = "phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7";
const POSTHOG_HOST = "https://p.laminar.sh";

export type Feature = "sessions" | "signals" | "traces" | "alerts";

let initialized = false;

export const init = (telemetryEnabled: boolean) => {
  if (!telemetryEnabled || initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
  });
  initialized = true;
};

export const identify = (userId: string, traits?: Record<string, unknown>) => {
  if (!initialized) return;
  posthog.identify(userId, traits);
};

export const group = (type: string, id: string, traits?: Record<string, unknown>) => {
  if (!initialized) return;
  posthog.group(type, id, traits);
};

export const reset = () => {
  if (!initialized) return;
  posthog.reset();
};

export const track = (feature: Feature, action: string, properties?: Record<string, unknown>) => {
  if (!initialized) return;
  posthog.capture(`${feature}:${action}`, properties);
};

export { posthog };
