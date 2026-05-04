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

// Module-level singleton status. posthog-js is browser-only and JS is single-threaded,
// so there is no concurrent-write race condition. "pending" covers the window before
// PostHogProvider's init effect runs — React fires child effects before parent effects,
// so descendants (e.g. WorkspaceGroupTracker) may call group/identify/track before init.
// We queue those calls and flush on init so they aren't silently dropped.
let status: "pending" | "initialized" | "disabled" = "pending";
const pendingCalls: Array<() => void> = [];

const runOrQueue = (fn: () => void) => {
  if (status === "initialized") {
    fn();
  } else if (status === "pending") {
    pendingCalls.push(fn);
  }
};

export const init = (telemetryEnabled: boolean) => {
  if (status !== "pending") return;
  if (!telemetryEnabled) {
    status = "disabled";
    pendingCalls.length = 0;
    return;
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
  });
  status = "initialized";
  const calls = pendingCalls.splice(0);
  for (const fn of calls) fn();
};

export const identify = (userId: string, traits?: Record<string, unknown>) => {
  runOrQueue(() => posthog.identify(userId, traits));
};

export const group = (type: string, id: string, traits?: Record<string, unknown>) => {
  runOrQueue(() => posthog.group(type, id, traits));
};

export const reset = () => {
  runOrQueue(() => posthog.reset());
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
  runOrQueue(() =>
    posthog.capture(`${feature}:${action}`, properties, {
      send_instantly: options?.sendInstantly,
    })
  );
};

export { posthog };
