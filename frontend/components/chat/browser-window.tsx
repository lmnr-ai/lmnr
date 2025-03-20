"use client";

import { Pause } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { useBrowserContext } from "@/components/chat/browser-context";
import { AgentSession } from "@/components/chat/types";
import { cn, swrFetcher } from "@/lib/utils";

import { ResizableHandle, ResizablePanel } from "../ui/resizable";

const BrowserWindow = () => {
  const pathname = usePathname();
  const chatId = pathname.split("/")?.[2];
  const [isResizing, setIsResizing] = useState(false);
  const { data } = useSWR<Pick<AgentSession, "vncUrl" | "status">>(
    () => (chatId ? `/api/agent-sessions/${chatId}` : null),
    swrFetcher,
    {
      refreshInterval: 1500,
      fallbackData: { vncUrl: undefined, status: undefined },
    }
  );

  const { open } = useBrowserContext();

  return (
    <>
      <ResizableHandle onDragging={setIsResizing} withHandle />
      <ResizablePanel
        className={cn("flex overflow-hidden flex-1 max-w-0", {
          "max-w-full px-4": data?.vncUrl && open,
          "transition-all duration-300 ease-linear": !isResizing,
        })}
        defaultSize={40}
        maxSize={60}
        minSize={20}
      >
        {data?.vncUrl && (
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
            {data?.status === "paused" && (
              <div className="absolute z-50 flex items-center justify-center size-full">
                <Pause size={24} />
              </div>
            )}
            <div className="absolute z-50 w-full h-full bg-transparent" />
          </div>
        )}
      </ResizablePanel>
    </>
  );
};

export default BrowserWindow;
