// Stub barrel of the Laminar Agent runtime — the agent is not part of the open-source distribution.
// In `lmnr-private` this same path re-exports the real implementation; shared server code
// (`instrumentation.ts`, `lib/actions/slack/webhook.ts`) imports from `@/lib/agent`, so those files stay
// byte-identical across distributions while this barrel swaps between the real agent and these no-ops.

export type SlackMention = {
  teamId: string;
  channelId: string;
  threadTs: string;
  ts: string;
  text: string;
  appId: string;
};

export const resumeAgentSessions = async (): Promise<void> => {};

export const handleSlackMention = async (_mention: SlackMention): Promise<void> => {};
