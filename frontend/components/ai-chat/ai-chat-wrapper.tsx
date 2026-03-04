"use client";

import { useParams, usePathname } from "next/navigation";
import { type PropsWithChildren, useEffect } from "react";

import AskAIButton from "@/components/ai-chat/ask-ai-button";
import SidePanelChat from "@/components/ai-chat/side-panel-chat";
import { useAIChatStore } from "@/lib/ai-chat/store";

export default function AIChatWrapper({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const params = useParams();
  const setPageContext = useAIChatStore((state) => state.setPageContext);

  // Sync current page and project ID to the AI chat store
  useEffect(() => {
    setPageContext({
      currentPage: pathname,
      projectId: params?.projectId as string | undefined,
    });
  }, [pathname, params?.projectId, setPageContext]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">{children}</div>
      <SidePanelChat />
      <AskAIButton />
    </div>
  );
}
