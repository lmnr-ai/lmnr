// agent_input is stringified JSON: a JSON string for plain-text tasks, or an object.
const inputText = (raw: unknown): string => {
  if (typeof raw !== "string" || raw === "") return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return raw;
  }
};

/** First trace's input, clamped to three lines behind a left rule in the trace view Input icon's blue. */
export default function FirstInputCell({ value }: { value: unknown }) {
  const text = inputText(value);
  if (!text) return <span className="text-foreground-300">-</span>;

  return (
    <div className="border-l-2 border-blue-400/70 pl-2">
      <span className="line-clamp-3 whitespace-normal break-words text-xs">{text}</span>
    </div>
  );
}
