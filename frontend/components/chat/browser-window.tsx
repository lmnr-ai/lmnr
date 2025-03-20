"use client";

import { usePathname } from "next/navigation";
import useSWR from "swr";

import { AgentSession } from "@/components/chat/types";
import { cn, swrFetcher } from "@/lib/utils";

import { ResizablePanel } from "../ui/resizable";

const BrowserWindow = () => {
  const pathname = usePathname();
  const chatId = pathname.split("/")?.[2];
  const { data } = useSWR<Pick<AgentSession, "vncUrl" | "status">>(
    () => (chatId ? `/api/agent-sessions/${chatId}` : null),
    swrFetcher,
    {
      refreshInterval: 1500,
      fallbackData: { vncUrl: undefined, status: undefined },
    }
  );

  return (
    <ResizablePanel
      className={cn("flex overflow-hidden flex-1 max-w-0", {
        "max-w-full px-4": data?.vncUrl,
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
            className="w-full h-full -pb-16 rounded-md animate-in fade-in zoom-in duration-500 fill-mode-forwards"
          />
          <div className="absolute bottom-0 w-full h-[4%] bg-background aspect-auto" />
          <div className="absolute z-50 w-full h-full bg-transparent" />
        </div>
      )}
    </ResizablePanel>
  );
};

export default BrowserWindow;
