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

/** Nothing can run the agent here, so features it writes (cluster reports) never start. */
export const AGENT_AVAILABLE = false;

export const agentAppUrl = () => (process.env.NEXT_PUBLIC_URL || "https://laminar.sh").replace(/\/+$/, "");

export const answerHeadlessTurn = async (turn: {
  conversationId?: string;
  [key: string]: unknown;
}): Promise<{ conversationId: string; answer: string; tools: string[]; error?: string }> => ({
  conversationId: turn.conversationId ?? "",
  answer: "",
  tools: [],
  error: "The Laminar Agent is not part of the open-source distribution",
});

export const resumeAgentSessions = async (): Promise<void> => {};

export const handleSlackMention = async (_mention: SlackMention): Promise<void> => {};
