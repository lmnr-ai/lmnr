import { PostHog } from "posthog-node";

import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog/constants";

import { claimReportingWindow, ensureTelemetrySchema, getInstanceId, releaseReportingWindow } from "./instance";
import { collectSnapshot } from "./stats";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const EVENT = "self_hosted_heartbeat";

const sendHeartbeat = async (): Promise<void> => {
  // Idempotent (CREATE ... IF NOT EXISTS); run every tick rather than once at
  // boot so a transient Postgres outage during startup doesn't permanently
  // disable telemetry — the next tick just retries.
  await ensureTelemetrySchema();

  // Ensure the singleton row exists next — getInstanceId is the only writer
  // that inserts it. claimReportingWindow is a bare UPDATE, so on a fresh
  // deployment it would match zero rows and the heartbeat would never start.
  const instanceId = await getInstanceId();

  // Cross-replica gate: only the pod that wins the window claim emits, so a
  // multi-replica deployment still produces a single heartbeat per period.
  const { claimed, previousReportedAt } = await claimReportingWindow(SIX_HOURS_MS);
  if (!claimed) {
    return;
  }

  // From here on we hold the window. If gathering or sending the event fails
  // (ClickHouse, Postgres, PostHog), release the window so the next hourly tick
  // retries instead of waiting out the full 6h period on a transient error.
  const client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  try {
    const snapshot = await collectSnapshot();

    // flushAt:1 means capture enqueues and flushes the event immediately, so
    // once this returns the event is on its way. shutdown() below is just
    // cleanup and must NOT gate the window — a shutdown error after a
    // successful send would otherwise free the window and let a later tick
    // emit a duplicate heartbeat for the same period.
    client.capture({
      // Identify the deployment by its users' company email domain when one
      // exists, so PostHog persons read as real organizations. The opaque
      // instance UUID remains the fallback (no users / freemail-only) and is
      // always attached as a property so two deployments sharing a domain
      // stay distinguishable.
      distinctId: snapshot.primaryDomain ?? instanceId,
      event: EVENT,
      properties: {
        instance_id: instanceId,
        ...snapshot.properties,
        $set: { instance_id: instanceId, ...snapshot.setProperties },
        // Setting $ip to null tells PostHog to drop the source IP entirely
        // (not just skip geoip enrichment), so no IP is ever stored against
        // the deployment.
        $ip: null,
      },
      // Belt-and-suspenders: also skip geoip enrichment on ingest.
      disableGeoip: true,
    });
  } catch (error) {
    console.error("Failed to send telemetry heartbeat:", error);
    await releaseReportingWindow(previousReportedAt).catch((releaseError) =>
      console.error("Failed to release telemetry reporting window:", releaseError)
    );
  }

  // Best-effort cleanup, outside the window-release path.
  await client.shutdown().catch((error) => console.error("Failed to shut down telemetry client:", error));
};

let started = false;

// Fire-and-forget usage telemetry for self-hosted deployments. Polls
// hourly; the 6h cadence is enforced by the DB window claim, not the timer, so
// restarts and multiple replicas can't over-report. Never throws into boot.
export const startTelemetry = async (): Promise<void> => {
  if (!isFeatureEnabled(Feature.TELEMETRY)) {
    return;
  }

  // Guard against repeated calls (e.g. Next.js hot-reload re-running the boot
  // hook) stacking multiple setInterval timers. The DB claim already prevents
  // duplicate emits, but stacked timers would still leak.
  if (started) {
    return;
  }
  started = true;

  // Schema setup happens inside sendHeartbeat (idempotent, retried per tick),
  // so a transient DB outage at boot can't permanently disable telemetry.
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
