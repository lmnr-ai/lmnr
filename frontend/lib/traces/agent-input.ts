/**
 * Display text for a trace's `agent_input`. Plain text is stored as itself; rows ingested before
 * that change (and non-string inputs) hold JSON, so a JSON string is unwrapped and anything else
 * is shown as compact JSON.
 */
export function agentInputText(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return raw;
  }
}
