"use client";

import { usePathname } from "next/navigation";
import useSWR from "swr";

import { AgentSession } from "@/components/chat/types";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn, swrFetcher } from "@/lib/utils";

interface BrowserWindowProps {
  onControl: () => void;
  isControlled: boolean;
}

const BrowserWindow = ({ onControl, isControlled }: BrowserWindowProps) => {
  const pathname = usePathname();
  const sessionId = pathname.split("/")?.[2];
  const { setOpen } = useSidebar();
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
      <div
        className={cn(
          "z-50 bg-background rounded-lg w-full flex flex-col transition-all duration-300 aspect-[4/3]",
          isBrowserActive
            ? "max-w-md sm:max-w-sm md:max-w-md xl:max-w-4xl 2xl:max-w-[60%] sm:px-4 md:px-8 lg:px-12"
            : "max-w-0",
          {
            "!max-w-full left-0 right-0 top-0 bottom-0 p-4": isControlled,
          }
        )}
      >
        <div
          className={cn(
            "relative flex items-center justify-center rounded-md overflow-hidden aspect-[4/3]",
            isControlled ? "mx-auto h-full" : "w-full my-auto"
          )}
        >
          <iframe src={data?.vncUrl} className="w-full h-full rounded-md bg-transparent aspect-[4/3]" />
          {!isControlled && <div className="absolute z-50 w-full h-full bg-transparent" />}
        </div>
        {isControlled && (
          <div className="mx-auto mt-4">
            <Button
              className="w-fit mx-auto"
              onClick={() => {
                onControl();
                setOpen(false);
              }}
            >
              {" "}
              Give control back
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export default BrowserWindow;
