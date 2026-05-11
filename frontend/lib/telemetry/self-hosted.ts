import os from "node:os";

import { sql } from "drizzle-orm";
import { PostHog } from "posthog-node";

import { db } from "@/lib/db/drizzle";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog/constants";

type SelfHostedEvent = "launched" | "heartbeat";

const EVENT_COLUMN: Record<SelfHostedEvent, "launched_at" | "heartbeat_at"> = {
  launched: "launched_at",
  heartbeat: "heartbeat_at",
};
const EVENT_COOLDOWN: Record<SelfHostedEvent, string> = {
  launched: "1 hour",
  heartbeat: "23 hours",
};
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
const LAUNCH_FLUSH_TIMEOUT_MS = 2000;

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
  // Only cache positive lookups. A transient DB error at startup must not
  // permanently disable telemetry for the process lifetime — subsequent
  // heartbeats re-query and recover once the DB is reachable again.
  if (cachedInstanceId) return cachedInstanceId;

  try {
    const rows = (await db.execute(sql`SELECT id FROM self_hosted_instance LIMIT 1`)) as { id: string }[];
    const id = rows[0]?.id ?? null;
    if (id) cachedInstanceId = id;
    return id;
  } catch {
    return null;
  }
};

export const tryClaimEvent = async (event: SelfHostedEvent): Promise<boolean> => {
  try {
    // Each event type claims on its own column so a recent heartbeat doesn't
    // suppress the next launch event (or vice versa) via a shared cooldown.
    const column = EVENT_COLUMN[event];
    const cooldown = EVENT_COOLDOWN[event];
    const rows = (await db.execute(sql`
      UPDATE self_hosted_instance
      SET ${sql.raw(column)} = NOW()
      WHERE ${sql.raw(column)} IS NULL
         OR ${sql.raw(column)} < NOW() - (${cooldown})::interval
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

    // Bounded flush on launch so a crashlooping/short-lived container
    // delivers the event before exit. Capped via Promise.race so
    // air-gapped installs / unreachable PostHog can't block startup
    // beyond LAUNCH_FLUSH_TIMEOUT_MS.
    if (event === "launched") {
      await Promise.race([
        client.flush().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, LAUNCH_FLUSH_TIMEOUT_MS).unref()),
      ]);
    }
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
