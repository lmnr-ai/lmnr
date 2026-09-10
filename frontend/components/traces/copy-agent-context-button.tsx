"use client";

import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AnimatedCodingAgentIcons, ClaudeLogo, CodexLogo, CursorLogo } from "@/components/common/coding-agent-logos";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

const COPIED_DURATION_MS = 2_000;
const CODING_AGENT_LOGOS = [
  { name: "Claude Code", Logo: ClaudeLogo },
  { name: "Codex", Logo: CodexLogo },
  { name: "Cursor", Logo: CursorLogo },
];

type CopyAgentContextButtonProps =
  | { type: "trace"; projectId: string; traceId: string }
  | { type: "span"; projectId: string; traceId: string; spanId: string };

function buildAgentContext(props: CopyAgentContextButtonProps) {
  const isSpan = props.type === "span";
  const query = isSpan
    ? `SELECT * FROM spans WHERE trace_id = '${props.traceId}' AND span_id = '${props.spanId}'`
    : `SELECT * FROM spans WHERE trace_id = '${props.traceId}' ORDER BY start_time ASC`;
  const identifiers = [
    `Project ID: ${props.projectId}`,
    `Trace ID: ${props.traceId}`,
    ...(isSpan ? [`Span ID: ${props.spanId}`] : []),
  ];

  return [
    `This is a Laminar ${props.type}`,
    ...identifiers,
    "",
    "If the `lmnr-cli` is installed, you can query with this command:",
    `lmnr-cli sql query "${query}" --project-id ${props.projectId}`,
  ].join("\n");
}

export function CopyAgentContextButton(props: CopyAgentContextButtonProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const { toast } = useToast();

  useEffect(() => () => clearTimeout(resetTimer.current ?? undefined), []);

  const copyContext = async () => {
    try {
      await navigator.clipboard.writeText(buildAgentContext(props));
      setCopied(true);
      clearTimeout(resetTimer.current ?? undefined);
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
    } catch {
      toast({ variant: "destructive", title: "Failed to copy agent context" });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-auto gap-1 pl-2 pr-1 bg-primary-200/15 hover:bg-primary-200/25 hover:text-primary-200 text-primary-400"
          onClick={copyContext}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label={`Copy context about this ${props.type} for your coding agent`}
        >
          <AnimatedCodingAgentIcons burst={hovered} />
          <div className="size-5 flex justify-center items-center">
            {copied ? (
              <Check data-icon="inline-end" size={16} />
            ) : (
              <ArrowUpRight size={20} strokeWidth={1.5} data-icon="inline-end" />
            )}
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="max-w-[200px] text-center px-3.5 py-2.5">
          <div className="flex flex-col items-center gap-2">
            {copied ? (
              "Copied"
            ) : (
              <>
                <span>Copy context about this {props.type} for your coding agent</span>
                <div className="flex items-center gap-2 text-foreground-300">
                  {CODING_AGENT_LOGOS.map(({ name, Logo }) => (
                    <Logo key={name} className="size-4" />
                  ))}
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
