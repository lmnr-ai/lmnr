import { type ReactNode } from "react";

// ──────────────────────────────────────────────────────────────────────
// The channel. Three kinds of message, produced by three different code
// paths, which is why they look different:
//
//   0. The signal-event alert is a BLOCK payload assembled by
//      `format_event_identification_blocks`: a `header` block reading
//      "{signal name} - :red_circle: Critical event", then a `table` block
//      whose first row is a literal "Field"/"Value" header and whose
//      remaining rows are the event payload's keys IN SCHEMA ORDER, then an
//      `actions` row. Condensed here — the real message keeps the Field/Value
//      header row, adds a third "Manage alerts" button, and closes with a
//      `context` statline ("*project* · Jul 2, 2026 at 2:32 PM UTC").
//
//      The payload keys are whatever the signal's `structured_output_schema`
//      defines, so `category` / `description` is an example shape, not a fixed
//      one. Values are capped at 2000 chars; a real `description` runs several
//      hundred. Span references inside it arrive already rewritten into
//      markdown links by `replace_span_tags_with_links`, which is why one word
//      of the sentence below is a link.
//
//   1. The new-cluster alert is a BLOCK payload assembled by
//      `format_new_cluster_blocks`: a fixed template plus an `actions` button
//      and a context row naming the signal + alert. Heavily condensed here —
//      the real template also prints the cluster name, `Events:`,
//      `First seen:`, `Last seen:` and a bulleted `Example events:` list, its
//      button reads "View Cluster", and the context row is dropped entirely,
//      because at landing scale the full digest is mostly chrome.
//
//   2. Everything the agent says afterwards is the model's own prose, and its
//      Slack output rules are mrkdwn-only (*bold*, `code`, "• " bullets,
//      `<url|label>` links; no headings, no tables).
//
//      DEPARTURE: the reply here ends in a button. In production the agent
//      posts ONE plain message via `post_thread_message` with no blocks, so a
//      real reply can only ever offer an inline link. The button is a
//      deliberate landing-page liberty for legibility, not a behaviour to
//      match — if the agent should really emit one, that is a change to
//      `slack_events.rs`, not to this mock.
//
// The failure continues section 03's "detect failures" scenario: the counts
// match its `Hallucinated invalid IDs` cluster and the worked example is the
// made-up-Postgres-column entry from that cluster's own event list, so the
// thread stays about the same coding agent as the rest of the page.
// ──────────────────────────────────────────────────────────────────────

const SIGNAL_NAME = "Hallucination Detector";
/** `severity_counts` sums to `num_signal_events` in the real payload. */
const CRITICAL_COUNT = 8;
const WARNING_COUNT = 25;
const EVENT_COUNT = CRITICAL_COUNT + WARNING_COUNT;

// Slack renders `*bold*` at the same weight as body text, just heavier.
const B = ({ children }: { children: ReactNode }) => <strong className="font-medium text-white">{children}</strong>;

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded border border-surface-300/50 bg-surface-400/50 px-1 py-px font-mono text-[11px] text-foreground-100">
    {children}
  </code>
);

// Slack's `actions` block button. Non-navigating: every URL in this mock points
// at a project that isn't the reader's.
const Btn = ({ children }: { children: ReactNode }) => (
  <div className="pt-0.5">
    <span className="inline-block rounded bg-surface-400 px-2 py-1 text-foreground-200">{children}</span>
  </div>
);

const Mention = () => <span className="rounded bg-primary-400/15 px-1 text-primary-200">@Laminar</span>;

const SeverityCount = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`size-2 shrink-0 rounded-full ${className}`} />
    {children}
  </span>
);

// A row of the payload table. Slack renders these as a real `table` block, so
// the key column is `is_wrapped: false` (fixed, never wraps) and the value
// column wraps — mirrored here with a fixed-width key and a flexible value.
//
// Two columns only once there is room for them: the values are schema field
// values, so they are frequently one long unbroken token (`invented_identifier`,
// a column name) that cannot wrap and would run out of the card at phone width.
// `overflow-wrap: anywhere` is what actually breaks those; the stacked layout is
// what keeps the break from happening every three characters.
const Field = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-surface-300/40 px-2 py-1.5 last:border-b-0 sm:flex-row sm:gap-3">
    <span className="font-medium text-white sm:w-[74px] sm:shrink-0">{name}</span>
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
  </div>
);

// A span reference the signal wrote into its payload, already rewritten from a
// `<span id=… name=… />` tag into a markdown link before it ever reached Slack.
const SpanLink = ({ children }: { children: ReactNode }) => (
  <span className="text-primary-200 underline underline-offset-2">{children}</span>
);

// Message 0 — one event firing. The `header` block, the payload table, and the
// first two of its three buttons.
const NewEventAlert = () => (
  <div className="flex flex-col gap-2.5">
    {/* One flowing line rather than a flex row, so a long signal name wraps and
        carries the severity badge onto the next line with it instead of
        stranding it in the vertical middle of two wrapped lines. */}
    <p className="text-sm font-medium text-white">
      {SIGNAL_NAME}{" "}
      <span className="inline-flex items-center gap-1.5 align-middle text-xs font-normal text-foreground-200">
        <span className="size-2 shrink-0 rounded-full bg-red-400" />
        Critical event
      </span>
    </p>

    <div className="rounded border border-surface-300/50 bg-surface-400/30">
      <Field name="category">invented_identifier</Field>
      <Field name="description">
        The column lookup returned no rows, so <SpanLink>llm</SpanLink> wrote <C>created_by_user_id</C> into the
        migration and reported the task complete.
      </Field>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <Btn>Open trace</Btn>
      <Btn>View similar events</Btn>
    </div>
  </div>
);

// Message 1 — the alert, cut down to a headline, a summary of the cluster, the
// severity split, the button and the context row.
const NewClusterAlert = () => (
  <div className="flex flex-col gap-2.5">
    <p>
      New cluster: <B>{SIGNAL_NAME}</B>
    </p>

    <p>When a lookup comes back empty the agent invents an identifier and carries on as if it were real.</p>

    <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <SeverityCount className="bg-red-400">{CRITICAL_COUNT} Critical</SeverityCount>
      <SeverityCount className="bg-orange-400/80">{WARNING_COUNT} Warning</SeverityCount>
    </p>

    <Btn>View similar issues</Btn>
  </div>
);

const AskForExample = () => (
  <p>
    <Mention /> show me one of these
  </p>
);

// The agent reaches the example by querying: `query_sql` for a trace in the
// cluster, then `get_trace_context` to read it. One unbroken paragraph rather
// than the bulleted form the Slack rules also allow: the whole point is a
// causal chain (empty lookup, invented name, failed query, success anyway), and
// splitting it into bullets reads as four unrelated observations.
const ExampleAnswer = () => (
  <div className="flex flex-col gap-2.5">
    <p>
      Here is a clean one. No author column existed, so the agent invented one: it wrote <C>created_by_user_id</C> into
      the query, <C>bash</C> returned <C>column does not exist</C>, and it still reported the filter as shipped. The
      trace ended <C>success</C>, so error monitoring never saw it.
    </p>
    <Btn>View trace</Btn>
  </div>
);

const AskHowBad = () => (
  <p>
    <Mention /> how often does it keep the made-up name?
  </p>
);

const ScopeAnswer = () => (
  <div className="flex flex-col gap-2.5">
    <p>
      <B>9 of the {EVENT_COUNT} kept it</B> instead of stopping at the failed query.
    </p>
    <div className="flex flex-col gap-1 text-foreground-300">
      <p>• 6 wrote it into a migration, 3 into app code</p>
      <p>• all 9 reported the task complete</p>
    </div>
    <p>
      <B>Suggested fix:</B> reject identifiers that never appeared in a tool result.
    </p>
  </div>
);

export interface ThreadMessage {
  /** `app` renders the Laminar bot + APP badge; `user` renders the human. */
  author: "app" | "user";
  time: string;
  body: ReactNode;
}

export const THREAD_MESSAGES: ThreadMessage[] = [
  { author: "app", time: "9:41 AM", body: <NewEventAlert /> },
  { author: "app", time: "9:42 AM", body: <NewClusterAlert /> },
  { author: "user", time: "9:44 AM", body: <AskForExample /> },
  { author: "app", time: "9:44 AM", body: <ExampleAnswer /> },
  { author: "user", time: "9:45 AM", body: <AskHowBad /> },
  { author: "app", time: "9:45 AM", body: <ScopeAnswer /> },
];

export const THREAD_AUTHOR = "Robert Kim";
export const THREAD_CHANNEL = "#laminar-alerts";
