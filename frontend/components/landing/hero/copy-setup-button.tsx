"use client";

import { Check } from "lucide-react";
import { useState } from "react";

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
const CopySetupButton = () => {
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
      onClick={onCopy}
      className="flex items-center justify-center gap-1.5 w-[160px] h-[36px] rounded-sm border border-foreground-600 hover:bg-surface-600 transition-colors"
    >
      {copied && <Check className="size-4 text-foreground-200" />}
      <span className="font-sans-landing font-medium text-sm text-foreground-200">
        {copied ? "Copied" : "Setup in one prompt"}
      </span>
    </button>
  );
};

export default CopySetupButton;
