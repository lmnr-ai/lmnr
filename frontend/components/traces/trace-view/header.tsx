import { ChartNoAxesGantt, ChevronsRight, Disc, Expand } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { memo, useCallback } from "react";

import { AgentSessionButton } from "@/components/traces/agent-session-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import { Button } from "@/components/ui/button";
import MonoWithCopy from "@/components/ui/mono-with-copy";
import { Span, Trace } from "@/lib/traces/types";

interface HeaderProps {
  selectedSpan: Span | null;
  setSelectedSpan: (span: Span | null) => void;
  trace: Trace | null;
  fullScreen: boolean;
  handleClose: () => void;
  showBrowserSession: boolean;
  setShowBrowserSession: (showBrowserSession: boolean) => void;
  handleFetchTrace: () => void;
}

const Header = ({
  selectedSpan,
  trace,
  fullScreen,
  handleClose,
  setSelectedSpan,
  showBrowserSession,
  setShowBrowserSession,
  handleFetchTrace,
}: HeaderProps) => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const projectId = params?.projectId as string;

  const handleShowTimeline = useCallback(() => {
    setSelectedSpan(null);
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
  }, [pathName, router, searchParams, setSelectedSpan]);

  if (fullScreen) {
    return null;
  }

  return (
    <div className="h-12 flex flex-none items-center border-b gap-x-2 px-4">
      <Button variant={"ghost"} className="px-0" onClick={handleClose}>
        <ChevronsRight />
      </Button>
      <Link
        passHref
        href={`/project/${projectId}/traces/${trace?.id}${selectedSpan ? `?spanId=${selectedSpan.spanId}` : ""}`}
      >
        <Button variant="ghost" className="px-0 mr-1">
          <Expand className="w-4 h-4" size={16} />
        </Button>
      </Link>
      <div className="flex items-center space-x-2 min-w-0">
        <span>Trace</span>
        <div className="min-w-0 flex-shrink">
          <MonoWithCopy className="truncate text-secondary-foreground mt-0.5">{trace?.id}</MonoWithCopy>
        </div>
      </div>
      <div className="flex gap-x-2 items-center ml-auto">
        {selectedSpan && (
          <Button variant={"secondary"} onClick={handleShowTimeline}>
            <ChartNoAxesGantt size={16} className="mr-2" />
            Show timeline
          </Button>
        )}
        {trace?.hasBrowserSession && (
          <Button
            variant={"secondary"}
            onClick={() => {
              setShowBrowserSession(!showBrowserSession);
            }}
          >
            <Disc size={16} className="mr-2" />
            {showBrowserSession ? "Hide browser session" : "Show browser session"}
          </Button>
        )}

        {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
        {trace && (
          <ShareTraceButton
            refetch={handleFetchTrace}
            trace={{ id: trace.id, visibility: trace?.visibility }}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
};

export default memo(Header);
