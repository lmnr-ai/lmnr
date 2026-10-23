// SANDBOX ONLY: fake agent data for UI tuning. Do not merge.
import {
  type AgentListItem,
  type AgentVersionItem,
  type AgentVersionsResult,
  type AgentVersionTracesPoint,
} from "./index";
import { CODING, EDGE_CASES, EMAIL, ONBOARDING, RESEARCH, ROUTER, SQL, SUMMARIZER, SUPPORT } from "./mock-content";

// Content hash so versions with identical text share a hash, like the real version keys.
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function version(
  idPrefix: string,
  n: number,
  prompt: string,
  tools: string,
  models: string[],
  createdAt: string
): AgentVersionItem {
  return {
    id: `${idPrefix}-0000-4000-8000-${String(n).padStart(12, "0")}`,
    versionHash: hash(prompt + tools),
    versionNumber: n,
    systemPromptVersionHash: hash(prompt),
    systemPrompt: prompt,
    toolDefinitionsHash: tools ? hash(tools) : "",
    toolDefinitions: tools,
    models,
    createdAt,
  };
}

/** Versions newest first, built from parallel prompt/tool lists (oldest first). */
function versions(
  idPrefix: string,
  content: { prompts: string[]; tools: string[] },
  models: string[][],
  dates: string[]
): AgentVersionItem[] {
  return content.prompts
    .map((prompt, i) => version(idPrefix, i + 1, prompt, content.tools[i], models[i], dates[i]))
    .reverse();
}

type MockAgent = Omit<AgentListItem, "versionCount"> & { versions: AgentVersionItem[] };

const MOCK_AGENTS: MockAgent[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Support agent",
    agentHash: "a1b2c3d4e5f6",
    createdAt: "2026-09-18T11:20:00Z",
    versions: versions(
      "aaaaaaaa",
      SUPPORT,
      [
        ["gpt-4o", "gpt-4o-mini"],
        ["gpt-5.1"],
        ["gpt-5.1", "claude-sonnet-5-5"],
        ["claude-sonnet-5-5"],
        ["claude-sonnet-5-5"],
      ],
      [
        "2026-09-18T11:20:00Z",
        "2026-10-02T17:05:00Z",
        "2026-10-09T13:30:00Z",
        "2026-10-15T09:40:00Z",
        "2026-10-21T14:12:00Z",
      ]
    ),
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Coding agent",
    agentHash: "f6a1b2c3d4e5",
    createdAt: "2026-09-25T16:00:00Z",
    versions: versions(
      "ffffffff",
      CODING,
      [["claude-sonnet-5-5"], ["claude-sonnet-5-5"], ["claude-sonnet-5-5", "claude-opus-5-5"], ["claude-opus-5-5"]],
      ["2026-09-25T16:00:00Z", "2026-10-03T10:15:00Z", "2026-10-12T18:45:00Z", "2026-10-20T08:30:00Z"]
    ),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Research planner",
    agentHash: "b2c3d4e5f6a1",
    createdAt: "2026-10-05T08:00:00Z",
    versions: [version("bbbbbbbb", 1, RESEARCH.prompt, RESEARCH.tools, ["claude-opus-5-5"], "2026-10-05T08:00:00Z")],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "SQL copilot",
    agentHash: "d4e5f6a1b2c3",
    createdAt: "2026-09-28T10:00:00Z",
    versions: versions(
      "dddddddd",
      SQL,
      [["gpt-4o-mini"], ["claude-haiku-5-5"], ["claude-haiku-5-5"]],
      ["2026-09-28T10:00:00Z", "2026-10-08T12:00:00Z", "2026-10-18T12:00:00Z"]
    ),
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Email triage",
    agentHash: "e5f6a1b2c3d4",
    createdAt: "2026-10-11T07:15:00Z",
    versions: versions("eeeeeeee", EMAIL, [["gpt-5.1"], ["gpt-5.1"]], ["2026-10-11T07:15:00Z", "2026-10-19T09:00:00Z"]),
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Enterprise onboarding concierge for workspace provisioning and SSO setup",
    agentHash: "a7b7c7d7e7f7",
    createdAt: "2026-10-01T15:00:00Z",
    versions: versions(
      "a7a7a7a7",
      ONBOARDING,
      [["gpt-5.1"], ["gpt-5.1", "gpt-5.1-mini"], ["gpt-5.1"]],
      ["2026-10-01T15:00:00Z", "2026-10-10T11:00:00Z", "2026-10-22T09:30:00Z"]
    ),
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    name: "Summarizer",
    agentHash: "b8b8b8b8b8b8",
    createdAt: "2026-09-20T09:00:00Z",
    versions: versions(
      "b8b8b8b8",
      SUMMARIZER,
      SUMMARIZER.prompts.map((_, i) =>
        i < 3 ? ["gpt-4o-mini"] : i < 6 ? ["gpt-4o-mini", "claude-haiku-5-5", "gemini-3-flash"] : ["claude-haiku-5-5"]
      ),
      SUMMARIZER.prompts.map((_, i) => new Date(Date.parse("2026-09-20T09:00:00Z") + i * 3.2 * 86400000).toISOString())
    ),
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    name: "Tool router",
    agentHash: "c9c9c9c9c9c9",
    createdAt: "2026-10-06T12:00:00Z",
    versions: versions(
      "c9c9c9c9",
      ROUTER,
      [["gpt-5.1-mini"], ["gpt-5.1-mini"], ["gpt-5.1-mini"], ["gpt-5.1"]],
      ["2026-10-06T12:00:00Z", "2026-10-13T12:00:00Z", "2026-10-18T12:00:00Z", "2026-10-22T10:00:00Z"]
    ),
  },
  {
    id: "edededed-eded-4ede-8ede-edededededed",
    name: "Edge cases",
    agentHash: "edededededed",
    createdAt: "2026-09-24T00:00:00Z",
    versions: versions(
      "edededed",
      EDGE_CASES,
      EDGE_CASES.prompts.map(() => ["gpt-5.1-mini"]),
      EDGE_CASES.prompts.map((_, i) => new Date(Date.parse("2026-09-24T00:00:00Z") + i * 2 * 86400000).toISOString())
    ),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: null,
    agentHash: "c3d4e5f6a1b2",
    createdAt: "2026-10-20T19:30:00Z",
    versions: [],
  },
];

export const mockAgents = (): AgentListItem[] =>
  MOCK_AGENTS.map(({ versions, ...agent }) => ({ ...agent, versionCount: versions.length }));

export function mockAgentVersions(agentId: string, range: URLSearchParams): AgentVersionsResult | null {
  const agent = MOCK_AGENTS.find((a) => a.id === agentId);
  if (!agent) return null;
  const { versions, ...rest } = agent;
  return { agent: rest, versions, traces: mockTraces(versions, range) };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const UNIT_MS: Record<string, number> = { minute: 60 * 1000, hour: HOUR_MS, day: DAY_MS };

function resolveRange(range: URLSearchParams): [number, number] {
  const now = Date.now();
  const pastHours = Number(range.get("pastHours"));
  if (pastHours) return [now - pastHours * HOUR_MS, now];
  return [Date.parse(range.get("startDate") ?? ""), Date.parse(range.get("endDate") ?? "")];
}

// Traces per version, bucketed at the client-chosen interval: each new version
// ramps up over ~3 days while older ones drain.
function mockTraces(versions: AgentVersionItem[], range: URLSearchParams): AgentVersionTracesPoint[] {
  if (versions.length === 0) return [];
  const [from, to] = resolveRange(range);
  const step =
    Math.max(1, Number(range.get("intervalValue")) || 1) * (UNIT_MS[range.get("intervalUnit") ?? ""] ?? DAY_MS);
  if (!Number.isFinite(from) || !Number.isFinite(to) || (to - from) / step > 2000) return [];
  const starts = versions.map((v) => Date.parse(v.createdAt));
  const points: AgentVersionTracesPoint[] = [];
  for (let t = Math.floor(from / step) * step; t <= to; t += step) {
    const i = t / HOUR_MS;
    const perDay = 1200 + 400 * Math.sin(i / 48) + 250 * Math.sin(i / 14);
    const total = Math.round((perDay * step) / DAY_MS);
    const weights = versions.map((_, idx) => {
      const age = (t - starts[idx]) / DAY_MS;
      if (age < 0) return 0;
      const rampUp = Math.min(1, (age + 1) / 3);
      const newer = starts.filter((s) => s > starts[idx] && s <= t).length;
      return rampUp * Math.pow(0.15, newer);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    const point: AgentVersionTracesPoint = { timestamp: new Date(t).toISOString() };
    versions.forEach((v, idx) => (point[v.id] = sum ? Math.round((total * weights[idx]) / sum) : 0));
    points.push(point);
  }
  return points;
}
