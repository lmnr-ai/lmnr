import { getSlackChannels, type SlackChannel } from "@/lib/actions/slack";
import { ApiError } from "@/lib/api/errors";

// Slack's privacy model: a private channel's name is shown only to people in that channel. Stored
// targets keep a cached `channel_name`, so every read redacts it per viewer, and every write keeps
// the viewer from adding, removing, or renaming channels they can't see.

export type VisibleSlackChannels = Map<string, SlackChannel>;

export class SlackChannelNotVisibleError extends ApiError {
  constructor(channelIds: string[]) {
    super(
      `Slack channel ${channelIds.join(", ")} was not found. Private channels are only available to their members ` +
        "after they connect their Slack account, and only once the Laminar app is invited to the channel.",
      400
    );
    this.name = "SlackChannelNotVisibleError";
  }
}

export const toVisibleChannels = (channels: SlackChannel[]): VisibleSlackChannels =>
  new Map(channels.map((c) => [c.id, c]));

/** For reads: a Slack failure hides every channel rather than failing the page. */
export async function getVisibleSlackChannels(workspaceId: string, userId: string): Promise<VisibleSlackChannels> {
  try {
    return toVisibleChannels((await getSlackChannels(workspaceId, userId)).channels);
  } catch (e) {
    console.warn("Slack channel listing failed; hiding all channel names", e);
    return new Map();
  }
}

/** Visible channels get Slack's current name; others lose their name and are marked hidden. */
export function redactSlackChannel<T extends { channelId: string | null; channelName: string | null }>(
  row: T,
  visible: VisibleSlackChannels
): T & { hidden: boolean } {
  const channel = row.channelId ? visible.get(row.channelId) : undefined;
  return channel ? { ...row, channelName: channel.name, hidden: false } : { ...row, channelName: null, hidden: true };
}

/**
 * Applies a requested Slack channel set (which replaces the old one) to the stored targets.
 * Stored targets the caller can't see are always kept, already-stored channels are kept by id
 * (even if a rate-limited listing missed them), and every newly added channel must be visible.
 */
export function mergeSlackChannelSelection<T extends { channelId: string | null }>(input: {
  stored: T[];
  requestedIds: string[];
  visible: VisibleSlackChannels;
}): { kept: T[]; added: SlackChannel[] } {
  const requested = new Set(input.requestedIds);
  const storedIds = new Set(input.stored.flatMap((t) => (t.channelId ? [t.channelId] : [])));

  const kept = input.stored.filter(
    (t) => !t.channelId || !input.visible.has(t.channelId) || requested.has(t.channelId)
  );

  const newIds = [...requested].filter((id) => !storedIds.has(id));
  const notVisible = newIds.filter((id) => !input.visible.has(id));
  if (notVisible.length > 0) {
    throw new SlackChannelNotVisibleError(notVisible);
  }

  return { kept, added: newIds.map((id) => input.visible.get(id)!) };
}
