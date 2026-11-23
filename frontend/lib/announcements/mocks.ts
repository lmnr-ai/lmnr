import { type Announcement, MOCK_ANNOUNCEMENT_PREFIX } from "./types";

// Dev-only fixtures for previewing the sidebar carousel and details dialog.
// Fixed (not generated) so the server can pre-render their MDX bodies by id.
const IMAGE = "/opengraph-image.png";
const DAY_MS = 24 * 60 * 60 * 1000;

const AGENT_VERSIONS_BODY = `# Agent versions

Laminar now tracks every change to your agent's **system prompt and tools**, without any code changes. Each trace is tagged with the version that produced it, so you can see exactly when behavior changed and why.

<Callout kind="tip" title="Zero setup">
Versions are detected from the traces you already send. Tag deployments with a \`release\` attribute to version by release instead.
</Callout>

## What you get

<Steps>
  <Step title="Automatic agent detection">Laminar groups your LLM calls into agents, even when prompts start with dynamic text.</Step>
  <Step title="A version per real change">Dates, ids and user data are ignored, so only edits you made create a new version.</Step>
  <Step title="Prompt and tool diffs">Compare any two versions line by line, tool by tool.</Step>
</Steps>

<StatGrid>
  <Stat value="0" label="Code changes" />
  <Stat value="Per trace" label="Version tags" />
  <Stat value="Line-level" label="Prompt diffs" />
</StatGrid>
`;

const SESSION_VIEW_BODY = `# New Session View

We rebuilt Session View as a **chat thread**. Every turn of a conversation reads like the messages your users actually saw, instead of a wall of spans.

## How it works

- Each turn shows the user message and your agent's reply.
- Click a turn's **Worked** row to open the full trace beside the chat.
- Long sessions stay fast: turns load as you scroll.

<Callout kind="info" title="Where to find it">
Open any session from the **Traces** page, or go to **Sessions** in the sidebar.
</Callout>
`;

interface MockFixture extends Omit<Announcement, "created_at" | "expires_at"> {}

export const MOCK_ANNOUNCEMENT_FIXTURES: MockFixture[] = [
  {
    id: `${MOCK_ANNOUNCEMENT_PREFIX}agent-versions`,
    title: "Try Agent Versions",
    description: "Agent versions let you see changes to your prompts and tools over time.",
    details_image_src: IMAGE,
    long_description: AGENT_VERSIONS_BODY,
    cta_text: "Open agent versions",
    cta_link: "/agent-versions",
  },
  {
    id: `${MOCK_ANNOUNCEMENT_PREFIX}session-view`,
    title: "New Session View",
    description: "We revamped Session View to be a more intuitive chat interface.",
    long_description: SESSION_VIEW_BODY,
    cta_text: "Open sessions",
    cta_link: "/sessions",
  },
  {
    id: `${MOCK_ANNOUNCEMENT_PREFIX}link-only`,
    title: "An announcement with a much longer title than fits",
    description: "No details popup, so the button links straight to the CTA instead of Learn more.",
    cta_text: "Open SQL editor",
    cta_link: "/sql",
  },
];

export const buildMockAnnouncements = (now = Date.now()): Announcement[] =>
  MOCK_ANNOUNCEMENT_FIXTURES.map((fixture, i) => ({
    ...fixture,
    created_at: new Date(now - i * DAY_MS).toISOString(),
    expires_at: new Date(now + 30 * DAY_MS).toISOString(),
  }));
