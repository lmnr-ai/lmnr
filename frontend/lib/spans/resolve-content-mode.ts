import { tryParseJson } from "@/lib/utils";

export interface ResolvedContentMode {
  mode: "json" | "text";
  /** Single-item list: ContentRenderer shows the picker only when `modes.length > 1`. */
  modes: string[];
  value: string;
}

const structured = (data: unknown): ResolvedContentMode => ({
  mode: "json",
  modes: ["JSON"],
  value: JSON.stringify(data, null, 2),
});

/**
 * Shared by tool and text parts. Structured payloads render as JSON; free-form
 * content stays TEXT. Each part passes a single mode so the picker stays hidden.
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
  return { mode: "text", modes: ["TEXT"], value: typeof parsed === "string" ? parsed : raw };
};
