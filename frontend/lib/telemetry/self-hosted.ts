import { sql } from "drizzle-orm";
import os from "os";
import { PostHog } from "posthog-node";

import { db } from "@/lib/db/drizzle";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog/constants";

type TelemetryEvent = "launched" | "heartbeat";

const COOLDOWNS: Record<TelemetryEvent, string> = {
  launched: "1 hour",
  heartbeat: "23 hours",
};

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

let instanceIdPromise: Promise<string | null> | null = null;
let posthogClient: PostHog | null = null;

export function isTelemetryEnabled(): boolean {
  if (process.env.LAMINAR_CLOUD === "true") return false;
  if (process.env.SELF_HOSTED_TELEMETRY === "false") return false;
  return true;
}

export async function getInstanceId(): Promise<string | null> {
  if (!instanceIdPromise) {
    instanceIdPromise = (async () => {
      try {
        const rows = (await db.execute(sql`SELECT id FROM self_hosted_instance LIMIT 1`)) as unknown as Array<{
          id: string;
        }>;
        return rows[0]?.id ?? null;
      } catch {
        return null;
      }
    })();
  }
  return instanceIdPromise;
}

export async function tryClaimEvent(event: TelemetryEvent): Promise<boolean> {
  try {
    const cooldown = COOLDOWNS[event];
    const rows = (await db.execute(
      sql`UPDATE self_hosted_instance
          SET last_event_at = NOW()
          WHERE last_event_at IS NULL
             OR last_event_at < NOW() - INTERVAL ${sql.raw(`'${cooldown}'`)}
          RETURNING id`
    )) as unknown as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

function getPostHogClient(): PostHog | null {
  try {
    if (!posthogClient) {
      posthogClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
    }
    return posthogClient;
  } catch {
    return null;
  }
}

async function captureEvent(event: TelemetryEvent): Promise<void> {
  try {
    const instanceId = await getInstanceId();
    if (!instanceId) return;
    const client = getPostHogClient();
    if (!client) return;
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
    // Swallow — telemetry must never affect app lifecycle.
  }
}

export async function fireLaunchEvent(): Promise<void> {
  try {
    const instanceId = await getInstanceId();
    if (!instanceId) return;
    const won = await tryClaimEvent("launched");
    if (!won) return;
    await captureEvent("launched");
  } catch {
    // Swallow.
  }
}

export function startHeartbeat(): void {
  try {
    const timer = setInterval(async () => {
      try {
        const instanceId = await getInstanceId();
        if (!instanceId) return;
        const won = await tryClaimEvent("heartbeat");
        if (!won) return;
        await captureEvent("heartbeat");
      } catch {
        // Swallow.
      }
    }, HEARTBEAT_INTERVAL_MS);
    timer.unref();
  } catch {
    // Swallow.
  }
}
