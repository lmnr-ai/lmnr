"use client";

import { usePathname } from "next/navigation";
import useSWR from "swr";

import { cn, swrFetcher } from "@/lib/utils";

const BrowserWindow = () => {
  const pathname = usePathname();
  const chatId = pathname.split("/")?.[2];
  const { data } = useSWR<{ vncUrl: string | null }>(
    () => (chatId ? `/api/agent-session?chatId=${chatId}` : null),
    swrFetcher,
    {
      refreshInterval: 1000,
      fallbackData: { vncUrl: null },
    }
  );

  return (
    <div
      className={cn("flex relative overflow-hidden flex-1 border-l max-w-0 transition-all duration-1300 ease-in-out", {
        "max-w-2xl px-2": data?.vncUrl,
      })}
    >
      {data?.vncUrl && (
        <div className="relative w-[639px] h-[479px] my-auto overflow-hidden bg-background rounded-xl">
          <iframe
            width={639}
            height={479.25}
            src={data.vncUrl}
            className="absolute m-auto aspect-3/4 -top-4 -left-4 -right-4 -bottom-14 flex-grow-1 rounded-xl animate-in fade-in zoom-in duration-500 fill-mode-forwards"
          />
        </div>
      )}
    </div>
  );
};

export default BrowserWindow;
