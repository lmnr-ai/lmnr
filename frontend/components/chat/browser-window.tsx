"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { AgentSession } from "@/components/chat/types";
import { cn, swrFetcher } from "@/lib/utils";

import { ResizableHandle, ResizablePanel } from "../ui/resizable";

const BrowserWindow = () => {
  const pathname = usePathname();
  const sessionId = pathname.split("/")?.[2];
  const [isResizing, setIsResizing] = useState(false);

  const { data } = useSWR<Pick<AgentSession, "vncUrl" | "machineStatus">>(
    () => (sessionId ? `/api/agent-sessions/${sessionId}` : null),
    swrFetcher,
    {
      refreshInterval: 1500,
      fallbackData: { vncUrl: undefined, machineStatus: undefined },
    }
  );

  const isBrowserActive = data?.machineStatus === "running" && !!data?.vncUrl;

  return (
    <>
      <ResizableHandle onDragging={setIsResizing} withHandle />
      <ResizablePanel
        className={cn("flex overflow-hidden flex-1 max-w-0", {
          "max-w-full px-4": isBrowserActive,
          "transition-all duration-300 ease-linear": !isResizing,
        })}
        defaultSize={40}
        maxSize={60}
        minSize={20}
      >
        {isBrowserActive && (
          <div
            className="w-full relative flex items-center justify-center my-auto overflow-hidden bg-background rounded-md"
            style={{ aspectRatio: "4/3" }}
          >
            <iframe
              width="100%"
              height="100%"
              src={data.vncUrl}
              className="w-full h-full rounded-md animate-in bg-transparent fade-in zoom-in duration-500 fill-mode-forwards"
            />
            <div className="absolute z-50 w-full h-full bg-transparent" />
          </div>
        )}
      </ResizablePanel>
    </>
  );
};

export default BrowserWindow;
