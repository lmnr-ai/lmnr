"use client";
import { Check, Copy } from "lucide-react";
import { type MouseEvent, useState } from "react";

import { useDebuggerSessionViewStore } from "../store";
import EditableSessionTitle from "./editable-session-title";
import ShareSessionButton from "./share-session-button";
import { fmtRelative } from "./utils";

export interface SessionHeaderProps {
  title: string;
  // Earliest run start / latest run end across loaded traces, in epoch ms.
  // Undefined until at least one trace has loaded.
  createdMs?: number;
  lastActivityMs?: number;
  runCount: number;
  sessionId: string;
  projectId?: string;
  // Public shared view: read-only, no editable title / share toggle.
  isShared?: boolean;
}

/**
 * Session header at the top of the scrolling article column (Figma 4296:35652):
 * left-aligned, a 24px medium title over a single muted meta line. The
 * jump-to-latest affordance lives in the right-rail outline, not here.
 */
export default function SessionHeader({
  title,
  createdMs,
  lastActivityMs,
  runCount,
  sessionId,
  projectId,
  isShared = false,
}: SessionHeaderProps) {
  const [copied, setCopied] = useState(false);
  const sessionNameRaw = useDebuggerSessionViewStore((s) => s.sessionNameRaw);
  const setSessionName = useDebuggerSessionViewStore((s) => s.setSessionName);

  const onCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      await navigator.clipboard.writeText(sessionId);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <header className="flex flex-col gap-3 py-5 h-[180px] pt-14">
      {sessionId && !isShared ? (
        <EditableSessionTitle name={sessionNameRaw} sessionId={sessionId} onRenamed={setSessionName} />
      ) : (
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
      )}
      <div className="flex items-center gap-2.5 text-sm text-secondary-foreground">
        <span>Created {fmtRelative(createdMs)}</span>
        <span>·</span>
        <span>Updated {fmtRelative(lastActivityMs)}</span>
        <span>·</span>
        <span>
          {runCount} {runCount === 1 ? "trace" : "traces"}
        </span>
        <span>·</span>
        <button
          onClick={onCopy}
          className="hover:text-primary-foreground max-w-[140px] flex flex-row items-center gap-2"
        >
          Copy ID
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
        {!isShared && sessionId && projectId && (
          <>
            <span>·</span>
            <ShareSessionButton sessionId={sessionId} projectId={projectId} />
          </>
        )}
      </div>
    </header>
  );
}
