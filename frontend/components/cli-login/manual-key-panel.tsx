"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { CliLoginPanel } from "@/components/cli-login/panel";
import { Button } from "@/components/ui/button";

interface ManualKeyPanelProps {
  apiKey: string;
  projectName: string;
}

// Manual fallback: display the minted key ONCE for the user to copy into the
// CLI prompt. Treated like a password — never logged, shown only here.
export function ManualKeyPanel({ apiKey, projectName }: ManualKeyPanelProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can select the text manually */
    }
  };

  return (
    <CliLoginPanel title="Copy your API key">
      <p className="text-sm text-secondary-foreground">
        Authorized for <span className="font-medium text-foreground">{projectName}</span>. Paste this key back into the
        CLI prompt. Treat it like a password — it is shown only once.
      </p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
        <code className="flex-1 break-all font-mono text-xs">{apiKey}</code>
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy API key">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </div>
      <p className="text-xs text-secondary-foreground">
        You can revoke this key any time from the project settings → API keys page.
      </p>
    </CliLoginPanel>
  );
}
