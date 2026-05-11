import os from "node:os";

import { sql } from "drizzle-orm";
import { PostHog } from "posthog-node";

import { db } from "@/lib/db/drizzle";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog/constants";

type SelfHostedEvent = "launched" | "heartbeat";

const LAUNCH_COOLDOWN = "1 hour";
const HEARTBEAT_COOLDOWN = "23 hours";
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

let cachedInstanceId: string | null | undefined = undefined;
let posthogClient: PostHog | null = null;

export const isTelemetryEnabled = (): boolean => {
  if (process.env.LAMINAR_CLOUD === "true") return false;
  if (process.env.SELF_HOSTED_TELEMETRY === "false") return false;
  return true;
};

const getPostHogClient = (): PostHog => {
  if (!posthogClient) {
    posthogClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  }
  return posthogClient;
};

export const getInstanceId = async (): Promise<string | null> => {
  if (cachedInstanceId !== undefined) return cachedInstanceId;

  try {
    const rows = (await db.execute(sql`SELECT id FROM self_hosted_instance LIMIT 1`)) as { id: string }[];
    cachedInstanceId = rows[0]?.id ?? null;
  } catch {
    cachedInstanceId = null;
  }

  return cachedInstanceId;
};

export const tryClaimEvent = async (event: SelfHostedEvent): Promise<boolean> => {
  try {
    const cooldown = event === "launched" ? LAUNCH_COOLDOWN : HEARTBEAT_COOLDOWN;
    const rows = (await db.execute(sql`
      UPDATE self_hosted_instance
      SET last_event_at = NOW()
      WHERE last_event_at IS NULL
         OR last_event_at < NOW() - (${cooldown})::interval
      RETURNING id
    `)) as { id: string }[];
    return rows.length > 0;
  } catch {
    return false;
  }
};

const captureEvent = async (event: SelfHostedEvent): Promise<void> => {
  try {
    const instanceId = await getInstanceId();
    if (!instanceId) return;

    const won = await tryClaimEvent(event);
    if (!won) return;

    const client = getPostHogClient();
    client.capture({
      event: `instance:${event}`,
      distinctId: instanceId,
      properties: {
        version: process.env.LAMINAR_VERSION ?? "unknown",
        node_version: process.version,
        platform: os.platform(),
        arch: os.arch(),
        deployment_type: "self_hosted",
      },
    });
  } catch {
    // telemetry must never fail startup
  }
};

export const fireLaunchEvent = async (): Promise<void> => {
  await captureEvent("launched");
};

export const startHeartbeat = (): void => {
  try {
    const timer = setInterval(() => {
      void captureEvent("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);
    timer.unref();
  } catch {
    // telemetry must never fail startup
  }
};
