"use client";

import { Check, Copy, TerminalSquare } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDebugCommand,
  DEFAULT_LAUNCH_COMMAND,
  LAUNCH_COMMAND_STORAGE_KEY,
} from "@/components/debugger-sessions/debugger-session-view/debug-command";
import { useDebuggerSessionStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/lib/hooks/use-toast";

const DebugCommandPanel = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const replayTraceId = useDebuggerSessionStore((state) => state.trace?.id);
  const { toast } = useToast();

  const [launchCommand, setLaunchCommand] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LAUNCH_COMMAND;
    return sessionStorage.getItem(LAUNCH_COMMAND_STORAGE_KEY) ?? DEFAULT_LAUNCH_COMMAND;
  });
  // N = number of main-spine spans to cache and replay. Human-chosen entrypoint;
  // empty means replay the whole selected trace (omit LMNR_DEBUG_CACHE_UNTIL).
  const [cacheUntil, setCacheUntil] = useState("");
  const [copied, setCopied] = useState(false);

  const command = useMemo(() => {
    const n = cacheUntil.trim() === "" ? null : Number(cacheUntil);
    return buildDebugCommand({
      sessionId,
      replayTraceId,
      cacheUntil: n !== null && Number.isFinite(n) ? n : null,
      launchCommand,
    });
  }, [sessionId, replayTraceId, cacheUntil, launchCommand]);

  const copyCommand = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return true;
      } catch {
        // Clipboard API is unavailable on non-https / non-localhost origins
        // (self-hosted without a cert). The command stays visible below for
        // manual copy, so just nudge the user there.
        toast({ variant: "destructive", title: "Couldn't copy automatically — select the command to copy it" });
        return false;
      }
    },
    [toast]
  );

  const handleLaunchCommandChange = useCallback((value: string) => {
    setLaunchCommand(value);
    sessionStorage.setItem(LAUNCH_COMMAND_STORAGE_KEY, value);
  }, []);

  // Auto-copy whenever the selected run-to-replay or the cache entrypoint (N)
  // changes. Skip the first settled value so loading the page / the initial run
  // selection doesn't hijack the clipboard.
  const prevKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!replayTraceId) return;
    const key = `${replayTraceId}:${cacheUntil}`;
    if (prevKeyRef.current === null) {
      prevKeyRef.current = key;
      return;
    }
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    copyCommand(command).then((ok) => {
      if (ok) {
        toast({
          title: "Debug command copied",
          description: "Run it to replay from the selected trace.",
          action: (
            <ToastAction altText="Copy again" onClick={() => copyCommand(command)}>
              Copy again
            </ToastAction>
          ),
        });
      }
    });
  }, [replayTraceId, cacheUntil, command, copyCommand, toast]);

  if (!sessionId) return null;

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold text-secondary-foreground">Debug command</h4>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => copyCommand(command)}
          title="Copy command"
        >
          {copied ? <Check className="size-3.5 text-success-bright" /> : <Copy className="size-3.5" />}
        </Button>
      </div>

      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-secondary px-2 py-1.5 font-mono text-[11px] leading-snug text-secondary-foreground select-all">
        {command}
      </pre>

      <div className="flex items-center gap-2">
        <label className="shrink-0 text-[11px] text-muted-foreground" htmlFor="debug-cache-until">
          Cache N spine spans
        </label>
        <Input
          id="debug-cache-until"
          value={cacheUntil}
          onChange={(e) => setCacheUntil(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="all"
          className="h-7 w-20 font-mono text-[11px]"
          aria-label="Number of spine spans to cache"
        />
      </div>

      <Input
        value={launchCommand}
        onChange={(e) => handleLaunchCommandChange(e.target.value)}
        placeholder={DEFAULT_LAUNCH_COMMAND}
        className="font-mono text-[11px]"
        spellCheck={false}
        aria-label="Launch command"
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Set how you launch your agent (e.g. <span className="font-mono">npx tsx myagent.ts</span>). The{" "}
        <span className="font-mono">LMNR_DEBUG*</span> prefix is prepended automatically.
      </p>
    </div>
  );
};

export default DebugCommandPanel;
