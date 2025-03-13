'use client';

import { usePathname} from "next/navigation";
import useSWR from "swr";

import { cn, swrFetcher } from "@/lib/utils";

const BrowserWindow = () => {
  const pathname = usePathname();
  const chatId = pathname.split("/")?.[2];
  const { data } = useSWR<{ vncUrl: string | null }>(
    () => chatId ? `/api/agent_session?chatId=${chatId}` : null,
    swrFetcher,
    {
      refreshInterval: 1000,
      fallbackData: { vncUrl: null }
    }
  );

  return (
    <div className={cn("flex relative overflow-hidden flex-1 border-l max-w-0 transition-all duration-1300 ease-in-out", {
      'max-w-2xl px-2': data?.vncUrl
    })}>
      {data?.vncUrl && (
        <iframe
          src={data.vncUrl}
          className="absolute aspect-3/4 w-full h-full top-0 left-0 right-0 bottom-0 flex-grow-1 rounded-xl animate-in fade-in zoom-in duration-500 fill-mode-forwards"
        />
      )}
    </div>
  );
};

export default BrowserWindow;
