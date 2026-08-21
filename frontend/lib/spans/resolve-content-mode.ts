import { tryParseJson } from "@/lib/utils";

export interface ResolvedContentMode {
  mode: "yaml" | "text";
  /** Modes offered in the picker, alongside the CUSTOM templates ContentRenderer adds. */
  modes: string[];
  value: string;
}

// `value` stays pretty-printed JSON: JSON is a subset of YAML, so `renderText("yaml", …)`
// converts it for display, and switching the picker to JSON shows it unchanged.
const structured = (data: unknown): ResolvedContentMode => ({
  mode: "yaml",
  modes: ["YAML", "JSON"],
  value: JSON.stringify(data, null, 2),
});

/**
 * Shared by tool and text parts. Structured payloads render as YAML — it round-trips
 * losslessly from JSON (multi-line strings become `|-` literal blocks, so newlines and
 * indentation survive) and reads far better than braces-and-quotes.
 *
 * Free-form content stays TEXT. YAML mode is `YAML.stringify(YAML.parse(…))`, which is
 * destructive on prose: a `# Heading` line is parsed as a comment and silently dropped,
 * and `Error:\n  detail` collapses to one folded line. Markdown is worse still — it
 * strips leading indentation at parse time, so prompt-shaped content renders flat.
 */
export const resolveContentMode = (content: unknown): ResolvedContentMode => {
  if (content !== null && typeof content === "object") {
    return structured(content);
  }

  const raw = typeof content === "string" ? content : String(content ?? "");
  const parsed = tryParseJson(raw);
  if (parsed !== null && typeof parsed === "object") {
    return structured(parsed);
  }

  // Payloads arrive JSON-stringified (`"\"line 1\\nline 2\""`), so unwrap or the raw
  // quotes and \n escapes leak into the view.
  return { mode: "text", modes: ["TEXT", "YAML"], value: typeof parsed === "string" ? parsed : raw };
};
