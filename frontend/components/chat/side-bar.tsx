"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Edit, Loader, MoreHorizontalIcon, SidebarIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { User } from "next-auth";
import { FocusEvent, KeyboardEventHandler, memo, MouseEvent, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import AgentSidebarFooter from "@/components/chat/sidebar-footer";
import { AgentSession } from "@/components/chat/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

export function AgentSidebar({ user }: { user: User }) {
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const pathname = usePathname();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const match = pathname.match(/\/chat\/([^\/]+)/);
    const chatId = match ? match[1] : null;
    setActiveId(chatId);
  }, [pathname]);

  const { data, isLoading } = useSWR<AgentSession[]>("/api/agent-sessions", swrFetcher, { fallbackData: [] });

  const handleNewChat = () => {
    router.push("/chat");
    router.refresh();
  };

  return (
    <Sidebar>
      <SidebarHeader className="text-primary-foreground">
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Button variant="ghost" size="icon" className="size-8 hover:bg-muted" onClick={toggleSidebar}>
              <SidebarIcon size={16} />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 hover:bg-muted" onClick={handleNewChat}>
                  <Edit size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pt-2 text-primary-foreground">
        {isLoading ? (
          <Loader size={16} className="animate-spin self-center" />
        ) : (
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <AnimatePresence mode="popLayout">
                  {data?.map((chat) => <ChatItem key={chat.chatId} chat={chat} isActive={chat.chatId === activeId} />)}
                </AnimatePresence>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <AgentSidebarFooter user={user} />
    </Sidebar>
  );
}

const PureChatItem = ({ chat, isActive }: { chat: AgentSession; isActive: boolean }) => {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();
  const params = useParams();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEdit = async (value: string) => {
    if (value === chat.chatName) return;
    try {
      const response = await fetch(`/api/agent-sessions/${chat.chatId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: value }),
      });

      if (response.ok) {
        await mutate(
          "/api/agent-sessions",
          (sessions?: AgentSession[]) =>
            sessions?.map((session) => (session.chatId === chat.chatId ? { ...session, chatName: value } : session)),
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );
        toast({ title: "Chat updated successfully." });
      }
    } catch (error) {
      console.error("Failed to update chat name:", error);
    }
  };

  const handleOnBlur = async (e: FocusEvent<HTMLInputElement>) => {
    await handleEdit(e.target.value);
    setIsEditing(false);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = async (e) => {
    if (e.key === "Enter" && "value" in e.target) {
      await handleEdit(e.target.value as string);
      setIsEditing(false);
    }
  };

  const handleDelete = async (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/agent-sessions/${chat.chatId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await mutate(
          "/api/agent-sessions",
          (sessions?: AgentSession[]) => (sessions ? [...sessions.filter((s) => s.chatId !== chat.chatId)] : []),
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );
        if (chat.chatId === params?.chatId) {
          router.push("/chat");
        }
        toast({ title: "Chat deleted successfully." });
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="group overflow-hidden !pr-0" asChild isActive={isActive}>
        {isEditing ? (
          <div className="pr-2">
            <Input
              ref={inputRef}
              type="text"
              defaultValue={chat.chatName}
              onKeyDown={handleKeyDown}
              onBlur={handleOnBlur}
              className="w-full bg-transparent border-token-border-light p-0.5 h-fit"
              onClick={(e) => e.preventDefault()}
            />
          </div>
        ) : (
          <Link className="pr-2 overflow-hidden" href={`/chat/${chat.chatId}`} key={chat.chatId} passHref>
            <motion.div
              title={chat.chatName}
              className="flex-1 truncate mr-5 hover:bg-muted rounded-md text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <AnimatedText animate={Boolean(chat?.isNew)} text={chat.chatName} />
            </motion.div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover className="mr-2 hover:bg-transparent">
                  <MoreHorizontalIcon />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setIsEditing(true);
                    }}
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <Edit size={16} />
                      <span>Rename</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete}>
                    <div className="flex flex-row gap-2 items-center">
                      <TrashIcon className="text-destructive" size={16} />
                      <span className="text-destructive">Delete</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const AnimatedText = ({ text, animate }: { text: string; animate: boolean }) => {
  if (animate) {
    return (
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{
          duration: 1.5,
          delay: 0.3,
          ease: "easeOut",
        }}
        className="truncate"
      >
        {text}
      </motion.div>
    );
  }
  return text;
};

const ChatItem = memo(PureChatItem);
