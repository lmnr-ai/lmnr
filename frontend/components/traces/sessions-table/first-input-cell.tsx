import { cn } from "@/lib/utils";

import { INPUT_BORDER_COLORS, useFirstInputStyle } from "./first-input-style";

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

/** First trace's input, clamped to three lines behind a colored left rule. */
export default function FirstInputCell({ value }: { value: unknown }) {
  const borderColor = useFirstInputStyle((s) => s.borderColor);
  const showBorder = useFirstInputStyle((s) => s.showBorder);
  const text = inputText(value);
  if (!text) return <span className="text-foreground-300">-</span>;

  return (
    <div className={cn(showBorder && ["border-l-2 pl-2", INPUT_BORDER_COLORS[borderColor]])}>
      <span className="line-clamp-3 whitespace-normal break-words text-xs">{text}</span>
    </div>
  );
}
