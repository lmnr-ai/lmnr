"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import RotatingAgentIcon from "./rotating-agent-icon";

// Copied verbatim from the traces placeholder's AgentTab (AGENT_PROMPT). No
// shared source of truth by design — this is the landing-hero copy.
const SETUP_PROMPT = `1. Run \`npx lmnr-cli setup\` at the project root to get started with Laminar. This command will authenticate the user, save a new project API key to .env, and install the Laminar skill.
2. Instrument your project with Laminar using the installed skill or the docs:
https://laminar.sh/docs/tracing/integrations/overview
3. Run your project.
4. Verify instrumentation:
\`lmnr-cli sql query "SELECT * FROM traces ORDER BY start_time DESC LIMIT 1" --json \`
5. View your traces in the browser`;

// Hero CTA: copies the one-prompt setup to the clipboard and flips to a
// "Copied" confirmation for 2s. Fixed width so the label swap causes no shift.
interface CopySetupButtonProps {
  className?: string;
}

const CopySetupButton = ({ className }: CopySetupButtonProps) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context / denied) — no-op.
    }
  };

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy setup prompt"}
      onClick={onCopy}
      className={cn(
        "group flex h-[36px] w-[220px] shrink-0 items-center justify-center gap-1.5 rounded-sm border border-foreground-600 transition-colors hover:bg-surface-200",
        className
      )}
    >
      {copied ? (
        <>
          <span className="font-sans-landing text-sm font-medium text-foreground-200">Copied</span>
          <Check className="size-4 text-foreground-200" />
        </>
      ) : (
        <>
          <span className="hidden font-sans-landing text-sm font-medium text-foreground-200 group-hover:inline">
            Copy setup prompt
          </span>
          <span className="inline-flex items-center gap-2.5 font-sans-landing text-sm font-medium text-foreground-200 group-hover:hidden">
            Setup with <RotatingAgentIcon /> in minutes
          </span>
        </>
      )}
    </button>
  );
};

export default CopySetupButton;
