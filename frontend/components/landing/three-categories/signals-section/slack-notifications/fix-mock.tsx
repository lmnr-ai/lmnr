import { motion, type MotionValue, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  progress: MotionValue<number>;
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

const FixMock = ({ className, progress }: Props) => {
  const opacity = useTransform(progress, [0, 0.4], [0.6, 1], { clamp: true });
  const x = useTransform(progress, [0, 0.4], [80, 0], { clamp: true });

  return (
    <motion.div style={{ opacity, x }} className="size-full flex items-center">
      <div
        className={cn(
          "bg-landing-surface-600 border border-landing-surface-500 rounded font-mono text-xs overflow-hidden",
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
                  "text-landing-text-400 bg-landing-surface-500/60 -mx-2 px-2": line.kind === "removed",
                  "text-landing-primary-300 bg-landing-primary-400-10 -mx-2 px-2": line.kind === "added",
                })}
              >
                {line.kind === "removed" ? "- " : line.kind === "added" ? "+ " : "  "}
                {line.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default FixMock;
