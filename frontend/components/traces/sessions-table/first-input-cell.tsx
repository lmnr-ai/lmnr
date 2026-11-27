import { agentInputText } from "@/lib/traces/agent-input";

/** First trace's input, clamped to two lines behind a left rule in the trace view Input icon's blue. */
export default function FirstInputCell({ value }: { value: unknown }) {
  const text = agentInputText(value);
  if (!text) return <span className="text-foreground-300">-</span>;

  return (
    <div className="border-l-2 border-blue-400/70 pl-2">
      <span className="line-clamp-2 whitespace-normal break-words text-xs">{text}</span>
    </div>
  );
}
