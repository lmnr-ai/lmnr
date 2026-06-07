import { PostHog } from "posthog-node";

import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog/constants";

import { claimReportingWindow, ensureTelemetrySchema, getInstanceId } from "./instance";
import { collectSnapshot } from "./stats";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const EVENT = "self_hosted_heartbeat";

const sendHeartbeat = async (): Promise<void> => {
  // Cross-replica gate: only the pod that wins the window claim emits, so a
  // multi-replica deployment still produces a single heartbeat per period.
  const claimed = await claimReportingWindow(SIX_HOURS_MS);
  if (!claimed) {
    return;
  }

  const instanceId = await getInstanceId();
  const snapshot = await collectSnapshot();

  const client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  try {
    client.capture({
      distinctId: instanceId,
      event: EVENT,
      properties: {
        ...snapshot.properties,
        $set: snapshot.setProperties,
      },
      // First-party proxy still sees the source IP; disabling geoip stops it
      // being turned into location person-properties, keeping the deployment
      // anonymous beyond the opaque instance id.
      disableGeoip: true,
    });
    await client.shutdown();
  } catch (error) {
    console.error("Failed to send telemetry heartbeat:", error);
  }
};

// Fire-and-forget anonymous usage telemetry for self-hosted deployments. Polls
// hourly; the 6h cadence is enforced by the DB window claim, not the timer, so
// restarts and multiple replicas can't over-report. Never throws into boot.
export const startTelemetry = async (): Promise<void> => {
  if (!isFeatureEnabled(Feature.TELEMETRY)) {
    return;
  }

  try {
    await ensureTelemetrySchema();
  } catch (error) {
    console.error("Failed to initialize telemetry schema, telemetry disabled:", error);
    return;
  }

  const tick = () => {
    sendHeartbeat().catch((error) => console.error("Telemetry heartbeat error:", error));
  };

  tick();
  const interval = setInterval(tick, 60 * 60 * 1000);
  // Don't keep the event loop alive on account of telemetry.
  if (typeof interval.unref === "function") {
    interval.unref();
  }
};
