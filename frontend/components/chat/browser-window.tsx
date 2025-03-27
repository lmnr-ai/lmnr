"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { AgentSession } from "@/components/chat/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn, swrFetcher } from "@/lib/utils";

import { ResizableHandle, ResizablePanel } from "../ui/resizable";

interface BrowserWindowProps {
  onControl: () => void;
  isControlled: boolean;
}

const BrowserWindow = ({ onControl, isControlled }: BrowserWindowProps) => {
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

  if (!isBrowserActive) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {isControlled ? (
        <Dialog open>
          <DialogTitle className="invisible" />
          <DialogContent className="flex flex-col bg-background rounded-md overflow-hidden w-fit max-w-full h-full">
            <div className="h-full border mx-auto aspect-[4/3] flex flex-col items-center justify-center overflow-hidden bg-background rounded-md">
              <iframe
                width="100%"
                height="100%"
                src={data.vncUrl}
                className="w-full h-full rounded-md bg-transparent fill-mode-forwards"
              />
            </div>
            <Button variant="outline" onClick={onControl} className="mr-8 self-end px-4 py-2 rounded-md">
              Give control back
            </Button>
          </DialogContent>
        </Dialog>
      ) : (
        <>
          <ResizableHandle onDragging={setIsResizing} withHandle />
          <ResizablePanel
            className={cn("flex flex-col items-center justify-center flex-1 max-w-0", {
              "max-w-full px-4": true,
              "transition-all duration-300 ease-linear": !isResizing,
            })}
            defaultSize={40}
            maxSize={60}
            minSize={20}
          >
            <div className="relative flex items-center justify-center rounded-md overflow-hidden w-full aspect-[4/3]">
              <iframe src={data.vncUrl} className="w-full h-full rounded-md bg-transparent" />
              <div className="absolute z-50 w-full h-full bg-transparent" />
            </div>
          </ResizablePanel>
        </>
      )}
    </AnimatePresence>
  );
};

export default BrowserWindow;
