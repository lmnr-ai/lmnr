import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

type Line = { kind: "context"; text: string } | { kind: "removed"; text: string } | { kind: "added"; text: string };

const LINES: Line[] = [
  { kind: "context", text: "const refineReport = async (input: string) => {" },
  { kind: "context", text: "  const prompt = [" },
  { kind: "context", text: "    'You are a report refinement assistant.'," },
  { kind: "removed", text: "    'Summarize the report in a few sentences.'," },
  { kind: "added", text: "    'Summarize the report in EXACTLY 3-4 sentences.'," },
  { kind: "added", text: "    'Do not exceed 4 sentences under any circumstance.'," },
  { kind: "context", text: "  ].join('\\n');" },
  { kind: "context", text: "" },
  { kind: "context", text: "  return await llm.complete({ prompt, input });" },
  { kind: "context", text: "};" },
];

const FixMock = ({ className }: Props) => (
  <div
    className={cn(
      "bg-landing-surface-500 border border-landing-text-600 rounded font-mono text-xs overflow-hidden",
      className
    )}
  >
    <div className="flex items-start gap-3 px-2 py-1">
      <div className="text-landing-text-500 leading-5 text-right shrink-0 select-none">
        {LINES.map((_, i) => (
          <p key={i} className="mb-0">
            {i + 1}
          </p>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {LINES.map((line, i) => (
          <p
            key={i}
            className={cn("mb-0 leading-5 whitespace-pre", {
              "text-landing-text-300": line.kind === "context",
              "text-red-300/70 bg-red-500/10 -mx-2 px-2": line.kind === "removed",
              "text-green-300/80 bg-green-500/10 -mx-2 px-2": line.kind === "added",
            })}
          >
            {line.kind === "removed" ? "- " : line.kind === "added" ? "+ " : "  "}
            {line.text}
          </p>
        ))}
      </div>
    </div>
  </div>
);

export default FixMock;
