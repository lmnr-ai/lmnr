import { tryParseJson } from "@/lib/utils";

export interface ResolvedContentMode {
  mode: "json" | "text";
  /** Modes offered in the picker, alongside the CUSTOM templates ContentRenderer adds. */
  modes: string[];
  value: string;
}

/** Shared by tool and text parts: JSON object/array payloads render as JSON, everything
 *  else as plain text. Text rather than markdown because prompt-shaped content is
 *  whitespace-significant — markdown strips leading indentation at parse time, and
 *  promotes indented blocks to code blocks only when a blank line precedes them, so the
 *  same schema renders inconsistently. */
export const resolveContentMode = (content: unknown): ResolvedContentMode => {
  if (content !== null && typeof content === "object") {
    return { mode: "json", modes: ["JSON"], value: JSON.stringify(content, null, 2) };
  }

  const raw = typeof content === "string" ? content : String(content ?? "");
  const parsed = tryParseJson(raw);
  if (parsed !== null && typeof parsed === "object") {
    return { mode: "json", modes: ["JSON"], value: JSON.stringify(parsed, null, 2) };
  }

  // Payloads arrive JSON-stringified (`"\"line 1\\nline 2\""`), so unwrap or the raw
  // quotes and \n escapes leak into the view.
  return { mode: "text", modes: ["TEXT"], value: typeof parsed === "string" ? parsed : raw };
};
