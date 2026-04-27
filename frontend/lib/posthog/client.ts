import posthog from "posthog-js";

import { POSTHOG_HOST, POSTHOG_KEY } from "./constants";

export type Feature =
  | "sessions"
  | "debugger_sessions"
  | "signals"
  | "traces"
  | "alerts"
  | "sql_editor"
  | "settings"
  | "model_costs"
  | "api_keys"
  | "provider_api_keys"
  | "project"
  | "datasets"
  | "evaluations"
  | "evaluators"
  | "playgrounds"
  | "labeling_queues"
  | "dashboards"
  | "reports"
  | "integrations"
  | "billing"
  | "team"
  | "usage"
  | "onboarding"
  | "auth"
  | "workspace"
  | "deployment"
  | "blog"
  | "shared"
  | "invitations"
  | "notifications"
  | "advanced_search";

// Module-level singleton flag. posthog-js is browser-only and JS is single-threaded,
// so there is no concurrent-write race condition. The flag prevents calling posthog.init()
// more than once (React 18 strict mode double-invokes effects; the second call is a no-op).
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

interface TrackOptions {
  // Bypass posthog-js's batching queue and send the event immediately.
  sendInstantly?: boolean;
}

export const track = (
  feature: Feature,
  action: string,
  properties?: Record<string, unknown>,
  options?: TrackOptions
) => {
  if (!initialized) return;
  posthog.capture(`${feature}:${action}`, properties, {
    send_instantly: options?.sendInstantly,
  });
};

export { posthog };
