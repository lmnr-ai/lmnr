import { ExternalLink, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const TABS = [
  { id: "failure-detector", label: "Failure Detector", active: true },
  { id: "skills-suggestions", label: "Skills Suggestions", active: false },
  { id: "github-comments", label: "Github Comments A...", active: false },
];

type DescPart = string | { kind: "span"; label: string };

const DESCRIPTION: DescPart[] = [
  "The agent encountered multiple bash failures (",
  { kind: "span", label: "Bash" },
  " span, ",
  { kind: "span", label: "Bash" },
  " span, ",
  { kind: "span", label: "Bash" },
  " span) while trying to sync the repository. Specifically, it forgot to change directories into the repository in ",
  { kind: "span", label: "Bash" },
  " span and failed to correctly fetch the remote branch in ",
  { kind: "span", label: "Bash" },
  " span. These errors led to five consecutive LLM calls (",
  { kind: "span", label: "anthropic.messages" },
  " span, ",
  { kind: "span", label: "anthropic.messages" },
  " span, ",
  { kind: "span", label: "anthropic.messages" },
  " span) each costing ~90k tokens ($0.05+), totaling over $0.25 and 40 seconds to perform a simple branch verification.",
];

const SpanPill = ({ label }: { label: string }) => (
  <span className="inline-flex items-center px-1.5 rounded text-xs bg-[rgba(208,117,78,0.5)] text-landing-text-100 cursor-pointer">
    {label}
  </span>
);

const GetContextMock = ({ className }: Props) => (
  <div
    className={cn(
      "flex flex-col rounded-md border border-blue-400/30 bg-blue-400/12 overflow-hidden font-sans select-none gap-1 p-1",
      className
    )}
  >
    <div className="flex items-center justify-between pl-2.5 pr-2 pt-1.5 shrink-0">
      <span className="text-xs font-medium text-blue-200/60">Signal events</span>
      <X className="size-3.5 text-blue-200/60" />
    </div>

    <div className="flex flex-col gap-1.5 px-2 pb-1.5">
      <div className="inline-flex h-8 w-full items-center justify-center rounded-lg p-[3px] bg-blue-300/10 shrink-0">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex-1 h-full flex items-center justify-center rounded-md text-xs px-2 truncate",
              tab.active ? "bg-gray-900 text-foreground shadow-sm" : "text-foreground/80"
            )}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 shrink-0">
        <div className="flex items-center gap-1 rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1 text-xs text-foreground">
          <Sparkles className="size-3" />
          Open in AI Chat
        </div>
        <div className="flex items-center gap-1 rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1 text-xs text-foreground">
          <ExternalLink className="size-3" />
          Open in Signals
        </div>
      </div>

      <div className="rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1.5">
        <div className="text-xs text-blue-200/60 mb-1">category</div>
        <div className="inline-flex items-center px-2 py-0.5 rounded-full border border-blue-200/20 text-xs text-foreground">
          logic_error
        </div>
      </div>

      <div className="rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1.5">
        <div className="text-xs text-blue-200/60 mb-1">description</div>
        <div className="text-xs text-secondary-foreground leading-5 break-words">
          {DESCRIPTION.map((part, i) =>
            typeof part === "string" ? <span key={i}>{part}</span> : <SpanPill key={i} label={part.label} />
          )}
        </div>
      </div>
    </div>
  </div>
);

export default GetContextMock;
