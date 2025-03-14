"use client";

import { PanelRightOpen, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AgentSidebar() {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar } = useSidebar();

  // const { data, isLoading } = useSWR<AgentSession[]>("/api/agent-sessions", swrFetcher, { fallbackData: [] });

  return (
    <Sidebar>
      <SidebarHeader className="text-primary-foreground">
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Button variant="ghost" size="icon" className="size-8 hover:bg-muted" onClick={toggleSidebar}>
              <PanelRightOpen size={16} />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 hover:bg-muted"
                  onClick={() => {
                    setOpenMobile(false);
                    router.push("/chat");
                  }}
                >
                  <PlusIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pt-2 text-primary-foreground">
        <div className="flex flex-col flex-1 px-4">
          {/*{isLoading ? (*/}
          {/*  <Loader size={16} className="animate-spin self-center" />*/}
          {/*) : (*/}
          {/*  data?.map((chat) => (*/}
          {/*    <Link href={`/chat/${chat.chatId}`} key={chat.chatId} passHref>*/}
          {/*      <div className="p-2 hover:bg-muted rounded-md text-sm">{chat.name}</div>*/}
          {/*    </Link>*/}
          {/*  ))*/}
          {/*)}*/}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
