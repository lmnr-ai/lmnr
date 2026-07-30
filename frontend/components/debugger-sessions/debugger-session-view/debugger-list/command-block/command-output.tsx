"use client";

import { type ReactNode, useMemo, useState } from "react";

import { cn, tryParseJson } from "@/lib/utils";

// Rendered-length cap: a multi-MB output as one DOM text node stalls layout
// even when max-h clips it visually. The rest renders on explicit request.
const OUTPUT_CHAR_BUDGET = 20_000;

// Parse cap: `JSON.parse` + pretty `JSON.stringify` are O(payload) main-thread
// work and `output` has no server-side size limit, so an unbounded payload
// would stall the frame OUTPUT_CHAR_BUDGET exists to protect (~170ms at 20MB).
// Kept well above the render budget — pretty-printing expands, so a payload can
// exceed it and still be cheap to parse and worth a tree.
const JSON_PARSE_CHAR_BUDGET = 2_000_000;

interface CommandOutputProps {
  output?: string;
  failed?: boolean;
}

type FormattedOutput = { kind: "json"; value: unknown; pretty: string } | { kind: "text"; display: string };

/**
 * Pretty-print JSON when the whole payload parses; leave plain text alone.
 * Payloads over JSON_PARSE_CHAR_BUDGET skip the parse and render as text.
 */
function formatOutput(output: string): FormattedOutput {
  const trimmed = output.trim();
  if (trimmed.length === 0 || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return { kind: "text", display: output };
  }
  if (trimmed.length > JSON_PARSE_CHAR_BUDGET) return { kind: "text", display: output };

  const parsed = tryParseJson(trimmed);
  if (parsed === null) return { kind: "text", display: output };

  return { kind: "json", value: parsed, pretty: JSON.stringify(parsed, null, 2) };
}

function JsonValue({ value, failed }: { value: unknown; failed?: boolean }) {
  if (value === null) {
    return <span className={failed ? "text-destructive" : "text-muted-foreground"}>null</span>;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return <span className={failed ? "text-destructive" : "text-secondary-foreground"}>{String(value)}</span>;
  }
  if (typeof value === "string") {
    return <span className={failed ? "text-destructive" : "text-secondary-foreground"}>&quot;{value}&quot;</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-secondary-foreground">[]</span>;
    return (
      <span>
        {"["}
        <div className="pl-4">
          {value.map((item, i) => (
            <div key={i}>
              <JsonValue value={item} failed={failed} />
              {i < value.length - 1 && <span className="text-secondary-foreground">,</span>}
            </div>
          ))}
        </div>
        {"]"}
      </span>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-secondary-foreground">{"{}"}</span>;
    return (
      <span>
        {"{"}
        <div className="pl-4">
          {entries.map(([key, child], i) => (
            <div key={key}>
              <span className={failed ? "text-destructive" : "text-primary"}>&quot;{key}&quot;</span>
              <span className="text-secondary-foreground">: </span>
              <JsonValue value={child} failed={failed} />
              {i < entries.length - 1 && <span className="text-secondary-foreground">,</span>}
            </div>
          ))}
        </div>
        {"}"}
      </span>
    );
  }
  return <span className="text-secondary-foreground">{String(value)}</span>;
}

/**
 * A command's stdout/result text. JSON payloads render as a tree with
 * primary-colored keys; plain text stays as-is. Renders up to
 * OUTPUT_CHAR_BUDGET chars with a "Show full output" affordance for the
 * remainder (nothing is silently truncated). The box caps at max-h-80 with
 * internal scroll; `pre-wrap` + `break-words` keep one long line from
 * creating a huge scroll width.
 */
export default function CommandOutput({ output, failed }: CommandOutputProps) {
  const [showFull, setShowFull] = useState(false);

  const formatted = useMemo(
    () => (output === undefined || output.length === 0 ? null : formatOutput(output)),
    [output]
  );

  if (formatted === null) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No output</div>;
  }

  const fullText = formatted.kind === "json" ? formatted.pretty : formatted.display;
  const overBudget = fullText.length > OUTPUT_CHAR_BUDGET;
  // Tree build is O(nodes) — only use it when the pretty payload fits the
  // budget (or the user asked for the full body).
  const jsonValue: unknown | undefined =
    formatted.kind === "json" && (!overBudget || showFull) ? formatted.value : undefined;

  let body: ReactNode;
  if (jsonValue !== undefined) {
    body = (
      <div
        className="break-words px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground"
        style={{ overflowWrap: "anywhere" }}
      >
        <JsonValue value={jsonValue} failed={failed} />
      </div>
    );
  } else {
    body = (
      <pre
        className={cn(
          "whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5",
          failed ? "text-destructive" : "text-secondary-foreground"
        )}
      >
        {showFull || !overBudget ? fullText : fullText.slice(0, OUTPUT_CHAR_BUDGET)}
      </pre>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Only the text scrolls; the "show full" control lives OUTSIDE the
          scroller so it stays visible for an over-budget payload (whose
          truncated text is far taller than max-h-80) instead of being buried
          at the bottom of the inner scroll. */}
      <div className="max-h-80 overflow-auto">{body}</div>
      {overBudget && !showFull && (
        <button
          type="button"
          onClick={() => setShowFull(true)}
          className="self-start px-3 py-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Show full output ({fullText.length.toLocaleString()} chars)
        </button>
      )}
    </div>
  );
}
