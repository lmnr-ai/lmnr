import { type ReactNode } from "react";

// A signal-event alert, a new-cluster alert (both condensed block payloads),
// then the agent's own mrkdwn prose — continuing section 03's cluster so both
// stay about one coding agent. DEPARTURE: the replies end in buttons, where a
// real agent posts one plain message and could only offer an inline link.

const SIGNAL_NAME = "Hallucination Detector";
/** `severity_counts` sums to `num_signal_events` in the real payload. */
const CRITICAL_COUNT = 8;
const WARNING_COUNT = 25;
const EVENT_COUNT = CRITICAL_COUNT + WARNING_COUNT;

// Slack renders `*bold*` at the same weight as body text, just heavier.
const B = ({ children }: { children: ReactNode }) => <strong className="font-medium text-white">{children}</strong>;

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded border border-surface-350/50 bg-surface-300/50 px-1 py-px font-mono text-[11px] text-foreground-100">
    {children}
  </code>
);

// Slack's `actions` block button. Non-navigating: every URL in this mock points
// at a project that isn't the reader's.
const Btn = ({ children }: { children: ReactNode }) => (
  <div className="pt-0.5">
    <span className="inline-block rounded bg-surface-300 px-2 py-1 text-foreground-200">{children}</span>
  </div>
);

const Mention = () => <span className="rounded bg-primary-400/15 px-1 text-primary-200">@Laminar</span>;

const SeverityCount = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`size-2 shrink-0 rounded-full ${className}`} />
    {children}
  </span>
);

// A row of the payload table: fixed key column, wrapping value, as Slack's own
// `table` block renders it. Values are often one unbroken token, so they need
// `overflow-wrap: anywhere` AND the stacked layout below `sm` to stay in the card.
const Field = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-surface-350/40 px-2 py-1.5 last:border-b-0 sm:flex-row sm:gap-3">
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

    <div className="rounded border border-surface-350/50 bg-surface-300/30">
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

// One unbroken paragraph rather than the bullets the Slack rules also allow:
// this is a causal chain, and bullets read as unrelated observations.
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
  /** The gap AFTER this message, before the next one lands. Hand-set from the
   *  message's word count (noted per entry) so the reader finishes it before
   *  the thread moves — NOT computed, so recount after editing any copy. On
   *  the human's questions the gap is the agent working, not the reader
   *  reading, so it stays a think-beat regardless of word count. */
  gapAfterMs: number;
}

export const THREAD_MESSAGES: ThreadMessage[] = [
  // 29 words, but already on screen when the walk starts — the reader has had
  // it in view, so it gets an opening beat, not a full read.
  { author: "app", time: "9:41 AM", body: <NewEventAlert />, gapAfterMs: 700 },
  // 30 words.
  { author: "app", time: "9:42 AM", body: <NewClusterAlert />, gapAfterMs: 1400 },
  // 6 words; think-beat. Longest think in the thread: this question sends the
  // agent off to find and read a specific trace, where the second one only
  // counts events it has already grouped.
  { author: "user", time: "9:44 AM", body: <AskForExample />, gapAfterMs: 2000 },
  // 46 words, the longest read in the thread.
  { author: "app", time: "9:44 AM", body: <ExampleAnswer />, gapAfterMs: 2100 },
  // 9 words; think-beat.
  { author: "user", time: "9:45 AM", body: <AskHowBad />, gapAfterMs: 1600 },
  // Last message — nothing waits on it.
  { author: "app", time: "9:45 AM", body: <ScopeAnswer />, gapAfterMs: 0 },
];

export const THREAD_AUTHOR = "Robert Kim";
export const THREAD_CHANNEL = "#laminar-alerts";
