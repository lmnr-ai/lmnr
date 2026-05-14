import { type ClusterNode } from "@/components/signal/clusters-section/utils";
import { type ClusterStatsDataPoint } from "@/lib/actions/clusters";

export type MockEvent = {
  id: string;
  clusterId: string;
  minutesAgo: number;
  severity: "warning" | "critical";
  category: string;
  description: string;
  traceId: string;
};

export type MockDataset = {
  clusterTree: ClusterNode[];
  totalEventCount: number;
  clusteredEventCount: number;
  stats: ClusterStatsDataPoint[];
  events: MockEvent[];
};

export type SignalTabKey = "detect-failures" | "identify-user-friction" | "monitor-safety";

const NOW = new Date("2026-04-26T18:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const iso = (offsetHours: number) => new Date(NOW - offsetHours * HOUR).toISOString();

// ---------- Helpers ----------

// FNV-1a hash → bounded int. Deterministic recency for an event id, so the
// final sort is stable across renders without storing per-event seeds.
function hashToMinutes(id: string, max: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) % max;
}

function generateTraceId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ i, 0x01000193);
    segments.push((h >>> 0).toString(16).padStart(8, "0"));
  }
  return segments.join("");
}

const STATS_HOURS = 48;
const STATS_INTERVAL_HOURS = 2;

function generateStatsForCluster(clusterId: string, baseAmplitude: number, phase: number): ClusterStatsDataPoint[] {
  const points: ClusterStatsDataPoint[] = [];
  for (let h = STATS_HOURS; h >= 0; h -= STATS_INTERVAL_HOURS) {
    const t = (STATS_HOURS - h) / STATS_HOURS;
    const wave = Math.sin(t * Math.PI * 2 + phase);
    const noise = Math.sin(t * Math.PI * 7 + phase * 1.7) * 0.4;
    const value = Math.max(0, Math.round(baseAmplitude * (0.6 + 0.4 * wave + noise)));
    points.push({ cluster_id: clusterId, timestamp: iso(h), count: value });
  }
  return points;
}

function makeEvents(
  clusterId: string,
  category: string,
  baseSeverity: "warning" | "critical",
  descriptions: string[]
): MockEvent[] {
  return descriptions.map((description, i) => {
    const id = `${clusterId}-${i}`;
    return {
      id,
      clusterId,
      minutesAgo: hashToMinutes(id, 240),
      severity: i % 4 === 0 ? "critical" : baseSeverity,
      category,
      description,
      traceId: generateTraceId(id),
    };
  });
}

type LeafSpec = {
  id: string;
  name: string;
  parentId: string | null;
  amplitude: number;
  phase: number;
  category: string;
  severity: "warning" | "critical";
  descriptions: string[];
  createdHoursAgo: number;
};

type ParentSpec = {
  id: string;
  name: string;
  amplitude: number;
  phase: number;
  createdHoursAgo: number;
};

function buildScenario(parents: ParentSpec[], leaves: LeafSpec[]): MockDataset {
  // Build cluster tree
  const leafByParent = new Map<string | null, ClusterNode[]>();
  for (const leaf of leaves) {
    // Deterministic per-leaf multiplier in [8, 24] so SSR and client hydration agree.
    const numEvents = leaf.descriptions.length * (8 + hashToMinutes(`${leaf.id}:n`, 17));
    const node: ClusterNode = {
      id: leaf.id,
      name: leaf.name,
      parentId: leaf.parentId,
      level: leaf.parentId ? 2 : 1,
      numChildrenClusters: 0,
      numEvents,
      createdAt: iso(leaf.createdHoursAgo),
      updatedAt: iso(1),
      children: [],
    };
    const arr = leafByParent.get(leaf.parentId) ?? [];
    arr.push(node);
    leafByParent.set(leaf.parentId, arr);
  }

  const clusterTree: ClusterNode[] = [];
  for (const parent of parents) {
    const children = leafByParent.get(parent.id) ?? [];
    const parentEvents = children.reduce((sum, c) => sum + c.numEvents, 0);
    clusterTree.push({
      id: parent.id,
      name: parent.name,
      parentId: null,
      level: 1,
      numChildrenClusters: children.length,
      numEvents: parentEvents,
      createdAt: iso(parent.createdHoursAgo),
      updatedAt: iso(1),
      children,
    });
  }
  const standalone = leafByParent.get(null) ?? [];
  // Standalone leaves displayed at root — promote level to 1
  for (const node of standalone) {
    node.level = 1;
  }
  clusterTree.push(...standalone);

  // Stats
  const stats: ClusterStatsDataPoint[] = [];
  for (const parent of parents) stats.push(...generateStatsForCluster(parent.id, parent.amplitude, parent.phase));
  for (const leaf of leaves) stats.push(...generateStatsForCluster(leaf.id, leaf.amplitude, leaf.phase));

  // Events get a deterministic minutesAgo per id; sort recency-first.
  const events = leaves
    .flatMap((leaf) => makeEvents(leaf.id, leaf.category, leaf.severity, leaf.descriptions))
    .sort((a, b) => a.minutesAgo - b.minutesAgo);

  const totalEventCount = events.length + Math.round(events.length * 0.05);
  const clusteredEventCount = events.length;

  return { clusterTree, totalEventCount, clusteredEventCount, stats, events };
}

// ---------- Detect failures ----------

const DETECT_FAILURES = buildScenario(
  [
    { id: "df-tool", name: "Tool call failures", amplitude: 18, phase: 0, createdHoursAgo: 72 },
    { id: "df-llm-behavior", name: "LLM behavior issues", amplitude: 14, phase: 1.4, createdHoursAgo: 80 },
  ],
  [
    {
      id: "df-tool-auth",
      name: "Git authentication errors",
      parentId: "df-tool",
      amplitude: 9,
      phase: 0.3,
      category: "tool_error",
      severity: "warning",
      createdHoursAgo: 70,
      descriptions: [
        "Agent ran `git push` without configuring credentials, received 'Authentication failed' from the remote, and retried 3x.",
        "Tool 'git_clone' failed with 403 on a private repo because the token was scoped to read-only.",
        "Agent tried to commit on a detached HEAD without realizing it; the push was rejected by origin.",
        "SSH key mismatch when cloning from gh-mirror; agent did not fall back to HTTPS auth.",
        "Agent generated a PAT placeholder string and pasted it literally into the URL.",
        "Repeated 'Permission denied (publickey)' on every git operation in the same session.",
        "Agent tried to push to a branch protected by required reviews and silently swallowed the rejection.",
        "Auth refresh loop: token refreshed 6 times in 90s before agent gave up.",
      ],
    },
    {
      id: "df-tool-mcp",
      name: "MCP server timeouts",
      parentId: "df-tool",
      amplitude: 7,
      phase: 1.1,
      category: "tool_error",
      severity: "warning",
      createdHoursAgo: 48,
      descriptions: [
        "MCP server 'filesystem' did not respond within 30s; agent retried with the same payload twice.",
        "Tool call to 'mcp.search' timed out after the server stopped emitting heartbeats mid-stream.",
        "Agent waited 45s on 'mcp.shell' before falling back to local exec, doubling task latency.",
        "MCP transport closed unexpectedly; agent treated empty response as success.",
        "Two parallel MCP calls deadlocked the server; both returned timeouts after 30s.",
        "MCP 'browser' tool hung on a long-running navigate; agent never sent abort.",
        "Server restart mid-session caused 4 consecutive timeouts before reconnect.",
        "Agent re-issued the same MCP call instead of backing off after the first timeout.",
      ],
    },
    {
      id: "df-tool-fs",
      name: "File system permission errors",
      parentId: "df-tool",
      amplitude: 6,
      phase: 0.7,
      category: "tool_error",
      severity: "warning",
      createdHoursAgo: 60,
      descriptions: [
        "Tool 'write_file' raised PermissionDenied on /etc; agent did not consider sudo unavailable.",
        "Agent tried to chmod a file owned by root and got EPERM; retried with same arguments.",
        "Read on a symlink loop returned ELOOP; agent kept walking the same chain.",
        "Disk full (ENOSPC) during a tool that streamed a 4GB log; agent did not surface the error.",
        "EBUSY on a directory being deleted concurrently; agent treated it as transient and retried 5x.",
        "Tool 'mkdir' failed because the parent path was a regular file; agent did not check.",
        "Read-only filesystem under /nix/store; agent attempted to write a build artifact there.",
        "Agent created a 0-byte file because the underlying tool exited before the write flushed.",
      ],
    },
    {
      id: "df-llm-hallucinate",
      name: "Hallucinated invalid IDs",
      parentId: "df-llm-behavior",
      amplitude: 8,
      phase: 1.5,
      category: "logic_error",
      severity: "warning",
      createdHoursAgo: 96,
      descriptions: [
        "Agent referenced a UUID that does not exist in the dataset and built three follow-up calls around it.",
        "Made up a Postgres column 'created_by_user_id' that was actually 'creator_id'.",
        "Cited GitHub PR #4218 which does not exist; the closest real PR was #4128.",
        "Generated a Slack channel ID 'C012345ABCD' that does not match any channel in the workspace.",
        "Hallucinated a Stripe subscription ID and tried to issue a refund against it.",
        "Asserted 'feature flag X is rolled out to 100%' when the flag was disabled entirely.",
        "Quoted a Linear ticket title verbatim from training data instead of reading the live ticket.",
        "Invented an HTTP header 'X-Trace-Token' that was never set by upstream services.",
      ],
    },
    {
      id: "df-llm-mustache",
      name: "Broken template generation",
      parentId: "df-llm-behavior",
      amplitude: 7,
      phase: 2.8,
      category: "logic_error",
      severity: "warning",
      createdHoursAgo: 54,
      descriptions: [
        "Agent emitted unclosed `{{` in a mustache template, breaking downstream rendering.",
        "Mismatched braces in handlebars output caused the email body to render literal '{{name}}'.",
        "Tried to nest a partial inside a section without registering it; renderer threw silently.",
        "Generated `{{#if user}}{{else}}` without the implicit closing tag, swallowing the rest of the template.",
        "Variable name typo `{{usr.name}}` instead of `{{user.name}}` shipped to the user.",
        "Agent produced an HTML snippet inside a plaintext mustache block, breaking escapes.",
        "Looped on the same template fix 5 times without checking the renderer's actual error.",
        "Agent inserted JSON into a mustache field expecting string, causing a stringify-of-object output.",
      ],
    },
    {
      id: "df-llm-lint-loop",
      name: "Loops on lint verification",
      parentId: "df-llm-behavior",
      amplitude: 6,
      phase: 2.1,
      category: "logic_error",
      severity: "warning",
      createdHoursAgo: 40,
      descriptions: [
        "Agent ran `pnpm lint` four times in a row to verify the same change. No edits between runs.",
        "Re-issued anthropic.messages call 3x to ask whether lint passed instead of reading stdout.",
        "Looped on type-check after each tiny edit, adding 90s of latency before the actual fix.",
        "Agent restarted lint after every saved file, even when nothing semantic changed.",
        "Verified lint, then re-ran it because the previous run was 'too long ago' (12 seconds).",
        "Looped lint→fix→lint until the model context filled, then truncated mid-fix.",
        "Agent ignored the lint error message and just re-ran the linter expecting different output.",
        "Reasked itself 'did lint pass?' six times across consecutive turns in the same session.",
      ],
    },
    {
      id: "df-pr-incomplete",
      name: "Incomplete PR task completion",
      parentId: null,
      amplitude: 9,
      phase: 2.1,
      category: "logic_error",
      severity: "critical",
      createdHoursAgo: 80,
      descriptions: [
        "Agent marked the PR ready for review but skipped the test it was asked to add.",
        "Closed task as done while leaving a TODO comment that contradicted the success criteria.",
        "Submitted PR without updating the snapshot tests it broke; CI failed minutes later.",
        "Agent stopped after the first commit even though the issue had three checkboxes.",
        "Reported 'all tasks complete' but only the first of four file changes had been written.",
        "Final summary claimed migrations were generated; the migrations folder was untouched.",
        "Agent claimed to have updated the docs but only opened the file and did not edit it.",
        "Reported the bug as fixed without running the failing reproducer the user provided.",
      ],
    },
    {
      id: "df-cargo-wrong-dir",
      name: "Cargo commands wrong directory",
      parentId: null,
      amplitude: 4,
      phase: 4.0,
      category: "tool_error",
      severity: "warning",
      createdHoursAgo: 28,
      descriptions: [
        "Agent ran `cargo build` from repo root instead of `app-server/` and got 'no Cargo.toml found'.",
        "cd'd into the wrong workspace member, ran tests, reported failure as if it was real.",
        "Agent treated a build error from the wrong crate as the user's problem and tried to 'fix' it.",
        "Ran `cargo r` in a JS package directory and reported 'cargo not installed' to the user.",
        "Used `cargo test --manifest-path` with a path that didn't exist; retried 4 times verbatim.",
        "Agent assumed workspace mode but the repo uses standalone crates, breaking `--workspace`.",
        "Cargo locked complaining about a different target dir; agent deleted the wrong target/.",
        "Agent ran cargo from /tmp and got confused why dependencies weren't resolved.",
      ],
    },
  ]
);

// ---------- Identify user friction ----------

const USER_FRICTION = buildScenario(
  [
    { id: "uf-confused", name: "Confusion patterns", amplitude: 16, phase: 0.2, createdHoursAgo: 90 },
    { id: "uf-abandoned", name: "Abandonment patterns", amplitude: 11, phase: 1.3, createdHoursAgo: 82 },
  ],
  [
    {
      id: "uf-confused-rephrase",
      name: "Repeated rephrasing of same question",
      parentId: "uf-confused",
      amplitude: 11,
      phase: 0.5,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 80,
      descriptions: [
        "User rephrased the same shipping address question four times before the agent recognized the intent.",
        "User asked 'how do I cancel?' three different ways; agent gave the same canned answer each time.",
        "Same billing question reasked in 5 turns with progressively more frustrated tone.",
        "User typed the order ID three different formats trying to get the agent to recognize it.",
        "Three rephrases of 'what is my balance' resolved only after switching agents.",
        "User asked about return policy in plain English, then in legalese, then with timestamps.",
        "Repeated 'I just want to talk to a human' four times before escalation triggered.",
        "User asked the same date question across 6 turns, each time adding more context.",
      ],
    },
    {
      id: "uf-confused-clarify",
      name: "Asking 'what do you mean'",
      parentId: "uf-confused",
      amplitude: 6,
      phase: 0.9,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 70,
      descriptions: [
        "User explicitly said 'what do you mean by that?' twice in the same conversation.",
        "Agent used jargon ('idempotent retry'); user asked for clarification three turns in a row.",
        "Confusing pronoun reference left user asking 'which one?' repeatedly.",
        "Agent's answer contradicted itself; user said 'wait, which is it?'.",
        "User asked 'is that a yes or no?' after a long, hedged response.",
        "Agent referenced a feature by internal codename; user asked 'what's that?'.",
        "User typed 'sorry I don't understand' three times within 2 minutes.",
        "Agent's chained logic confused the user enough that they restated the goal twice.",
      ],
    },
    {
      id: "uf-confused-multi-intent",
      name: "Multiple concurrent intents",
      parentId: "uf-confused",
      amplitude: 5,
      phase: 1.4,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 56,
      descriptions: [
        "User asked about shipping and refunds in the same message; agent only addressed shipping.",
        "Three questions in one turn; agent answered the easiest and ignored the other two.",
        "User asked about cancellation, then mid-sentence asked about a refund. Agent missed the second.",
        "Compound intent split across two turns; agent treated them as unrelated.",
        "User listed five items they wanted help with; agent answered #1 and #5 only.",
        "Agent split a single intent into two follow-ups, doubling the conversation length.",
        "User asked 'and also' four times; each follow-up was treated as a fresh session.",
        "Multi-intent message routed to wrong agent because of the dominant first phrase.",
      ],
    },
    {
      id: "uf-abandoned-after-error",
      name: "Session abandoned after error",
      parentId: "uf-abandoned",
      amplitude: 8,
      phase: 1.6,
      category: "user_friction",
      severity: "critical",
      createdHoursAgo: 60,
      descriptions: [
        "User typed 'this is useless' and abandoned the session after the agent looped on an empty result.",
        "Agent threw a 500 to the user; user did not return for 24h.",
        "After three failed attempts the user closed the chat without sending another message.",
        "Agent apologized and asked user to retry; user never did.",
        "User received a stack trace inline in the chat and abandoned.",
        "Session ended right after agent admitted 'I cannot do that' for a routine task.",
        "User typed 'forget it' and the session ended on a polite agent reply.",
        "Agent asked for clarification four times in a row; user gave up.",
      ],
    },
    {
      id: "uf-abandoned-delay",
      name: "Long delay before reply",
      parentId: "uf-abandoned",
      amplitude: 4,
      phase: 2.0,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 40,
      descriptions: [
        "Agent took 38s to respond on a simple FAQ question; user dropped before the reply rendered.",
        "Streaming stalled for 22s mid-response; user closed the tab.",
        "First-token latency exceeded 12s on a known-good prompt; user disconnected.",
        "Tool call timed out for 30s; agent did not surface progress and user gave up.",
        "Long thinking trace blocked output; user reloaded the page mid-response.",
        "Agent re-tried twice silently; total round-trip 1m02s; user abandoned.",
        "User noted 'this is taking forever' and closed before the answer arrived.",
        "Cold-start latency on a low-traffic agent caused a 28s wait on the first turn.",
      ],
    },
    {
      id: "uf-frustrated",
      name: "Frustration in plain text",
      parentId: null,
      amplitude: 8,
      phase: 1.9,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 60,
      descriptions: [
        "User typed all-caps 'WHY IS THIS SO HARD'; agent responded with the same canned text.",
        "User typed an expletive directed at the agent in turn 4 of the conversation.",
        "User wrote 'this is a joke' after the agent declined a routine request.",
        "User called the agent 'useless' twice in the same session.",
        "User threatened to cancel their subscription mid-conversation.",
        "User wrote 'are you kidding me' after the agent asked for clarification a third time.",
        "User typed 'STOP' in caps after the agent kept apologizing without solving.",
        "User said 'I'll just call support' and the agent did not escalate.",
      ],
    },
    {
      id: "uf-deadend",
      name: "Dead-end loops",
      parentId: null,
      amplitude: 6,
      phase: 2.5,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 48,
      descriptions: [
        "Agent answered the same question with the same wording across 4 consecutive turns.",
        "Agent looped between two suggestions for 6 turns without progress.",
        "User asked 'is there anything else I can do' and got 'have you tried restarting?' four times.",
        "Agent suggested the same article on three consecutive turns.",
        "Agent kept asking 'can you confirm?' without ever moving forward.",
        "Loop on identical tool failure; agent never tried a different approach.",
        "Agent restated the user's question instead of answering, three times in a row.",
        "Conversation ended in a polite stalemate after 5 turns of no progress.",
      ],
    },
    {
      id: "uf-misroute",
      name: "Intent misrouted, wrong agent",
      parentId: null,
      amplitude: 4,
      phase: 3.1,
      category: "user_friction",
      severity: "warning",
      createdHoursAgo: 36,
      descriptions: [
        "User asked to refund an order but was routed to the FAQ agent. User gave up after two more turns.",
        "Billing question routed to support agent; support agent asked for clarification then routed back.",
        "User asked about a feature; agent treated it as a bug report and opened a ticket.",
        "Account-deletion intent routed to upsell agent; user got an offer instead of an action.",
        "Technical question routed to billing; billing replied with a generic 'please contact engineering'.",
        "User asked for invoice; routed to the password-reset agent due to the word 'reset'.",
        "Routing classifier confused 'cancel' (subscription) with 'cancel' (in-flight request).",
        "User asked to escalate; agent re-asked the original question instead of escalating.",
      ],
    },
  ]
);

// ---------- User intent ----------

const USER_INTENT = buildScenario(
  [
    { id: "ui-goals", name: "Identified user goals", amplitude: 13, phase: 0.4, createdHoursAgo: 96 },
    { id: "ui-outcomes", name: "Intent outcomes", amplitude: 9, phase: 1.6, createdHoursAgo: 70 },
  ],
  [
    {
      id: "ui-knowledge",
      name: "Knowledge lookup",
      parentId: "ui-goals",
      amplitude: 8,
      phase: 0.7,
      category: "knowledge_seek",
      severity: "warning",
      createdHoursAgo: 80,
      descriptions: [
        "User wanted to compare Stripe and Adyen for cross-border payouts; agent answered with a feature matrix.",
        "User asked 'how does our SLA work for enterprise plans' — looking up policy documentation.",
        "User researching whether to switch from Postgres to ClickHouse for their analytics workload.",
        "User asked for a definition of 'idempotency key' — basic API concept lookup.",
        "User wanted recent ARR benchmarks for B2B SaaS at $5-20M revenue range.",
        "User asked which OTel SDKs support context propagation in async runtimes.",
        "User looking up the difference between vector search and full-text search for RAG.",
        "User asked for the rate limits on the GPT-4o API in production tier.",
      ],
    },
    {
      id: "ui-automation",
      name: "Task automation request",
      parentId: "ui-goals",
      amplitude: 5,
      phase: 1.1,
      category: "automation_request",
      severity: "warning",
      createdHoursAgo: 60,
      descriptions: [
        "User wanted the agent to draft and send a follow-up email to a sales lead.",
        "User asked to schedule a recurring weekly report and post it to #engineering.",
        "User wanted to bulk-update the labels on 47 GitHub issues matching a query.",
        "User asked the agent to set up a cron job to refresh a stale data export nightly.",
        "User wanted to migrate 12 Notion pages into a Linear project as tickets.",
        "User asked to auto-reply to all support tickets older than 48 hours with a holding message.",
        "User wanted to deduplicate 200 Salesforce contacts with fuzzy matching.",
        "User asked to monitor a competitor's pricing page and alert on changes.",
      ],
    },
    {
      id: "ui-troubleshoot",
      name: "Troubleshooting & support",
      parentId: "ui-goals",
      amplitude: 4,
      phase: 1.5,
      category: "troubleshoot",
      severity: "warning",
      createdHoursAgo: 48,
      descriptions: [
        "User reporting that webhook deliveries to their endpoint are failing intermittently.",
        "User had a 500 error on checkout and wanted help isolating which service is failing.",
        "User couldn't get OAuth callback to work with their Vercel deployment.",
        "User's Slack alert wasn't firing despite the rule appearing correctly configured.",
        "User reporting that their Postgres connection pool keeps exhausting under modest load.",
        "User had a build failing in CI but passing locally — wanted help reproducing the failure.",
        "User got rate-limited unexpectedly and wanted to understand which endpoint hit the limit.",
        "User's evaluation pipeline was returning blank outputs for half the dataset.",
      ],
    },
    {
      id: "ui-fulfilled",
      name: "Intent fulfilled",
      parentId: "ui-outcomes",
      amplitude: 6,
      phase: 1.9,
      category: "outcome_fulfilled",
      severity: "warning",
      createdHoursAgo: 60,
      descriptions: [
        "User asked to draft a release announcement; agent delivered three options and user picked one.",
        "User wanted a SQL query to compute MAU per workspace; agent produced one that ran cleanly.",
        "User asked to summarize a 40-page customer interview; received summary matching user's framing.",
        "User wanted to set up a new project and got it provisioned end-to-end in one session.",
        "User asked for refactoring suggestions; accepted 4 of 5 and merged the resulting diff.",
        "User received exactly the answer needed and ended the session within 3 turns.",
        "User got a working code snippet and confirmed it solved the problem before signing off.",
        "User wanted documentation for a feature; agent surfaced the right page on the first try.",
      ],
    },
    {
      id: "ui-abandoned",
      name: "Intent abandoned",
      parentId: "ui-outcomes",
      amplitude: 4,
      phase: 2.4,
      category: "outcome_abandoned",
      severity: "warning",
      createdHoursAgo: 36,
      descriptions: [
        "User opened the chat to fix a broken integration but closed before the fix was confirmed.",
        "User abandoned mid-troubleshoot after the agent suggested escalating to support.",
        "User left after 2 turns when answers didn't match what they were looking for.",
        "User pasted an error and walked away without replying to the agent's clarifying question.",
        "User started drafting an email then closed the tab; no message was sent.",
        "User asked a question, got a long response, and never read it (no scroll/interaction).",
        "User abandoned after the third 'I'm not sure, can you provide more context?' from the agent.",
        "User left without confirming whether the proposed solution actually worked for them.",
      ],
    },
    {
      id: "ui-ambiguous",
      name: "Ambiguous intent",
      parentId: null,
      amplitude: 5,
      phase: 2.2,
      category: "intent_ambiguous",
      severity: "warning",
      createdHoursAgo: 58,
      descriptions: [
        "User typed 'fix this' with no context; agent had to ask three clarifying questions.",
        "User asked 'is it working' without specifying what 'it' refers to.",
        "User pasted a stack trace with no question; agent inferred a debugging request.",
        "User asked 'why' as a follow-up across 4 turns without anchoring it to any single fact.",
        "User wrote 'do the thing for me' — intent had to be inferred from session history.",
        "User said 'help' with nothing else; agent tried to elicit a goal in two follow-ups.",
        "User asked for 'the report' but had not previously discussed any report.",
        "User's first message was a smiley face with no further context.",
      ],
    },
    {
      id: "ui-compound",
      name: "Compound intent (multi-goal)",
      parentId: null,
      amplitude: 4,
      phase: 2.8,
      category: "intent_compound",
      severity: "warning",
      createdHoursAgo: 36,
      descriptions: [
        "User wanted to refactor the signup flow AND draft a launch email AND triage three bugs in one session.",
        "User asked to compare two vendors AND get help writing the procurement justification.",
        "User combined a billing question with a feature-request thread in one message.",
        "User wanted to update their profile, change their plan, and cancel a teammate's seat in one go.",
        "User asked to debug an integration AND write the postmortem at the same time.",
        "User submitted four loosely-related research questions in a single prompt.",
        "User wanted both the analysis and the visualizations and the slides — all in one ask.",
        "User threaded a documentation request inside a debugging session.",
      ],
    },
    {
      id: "ui-drift",
      name: "Intent drifted mid-session",
      parentId: null,
      amplitude: 3,
      phase: 3.4,
      category: "intent_drift",
      severity: "warning",
      createdHoursAgo: 24,
      descriptions: [
        "User started troubleshooting a deploy issue and ended up asking for help writing a Slack message.",
        "User opened with a billing question and shifted to asking how to migrate to a new product tier.",
        "User initially asked for a SQL query, then rerouted to discussing dashboard design.",
        "User pivoted from 'fix this bug' to 'rewrite this whole module' over the course of 6 turns.",
        "User asked about pricing then transitioned into a competitor comparison conversation.",
        "User started fact-finding a product question and ended scheduling a sales meeting.",
        "User opened a debugging chat then changed scope to a feature-request walk-through.",
        "User asked 'how does X work' and ended the conversation requesting a full implementation.",
      ],
    },
  ]
);

// ---------- Map ----------

export const MOCK_DATASETS: Record<SignalTabKey, MockDataset> = {
  "detect-failures": DETECT_FAILURES,
  "identify-user-friction": USER_FRICTION,
  "monitor-safety": USER_INTENT,
};
