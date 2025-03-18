"use client";

import { Edit, Loader, MoreHorizontalIcon, PanelRightOpen, PlusIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FocusEvent, KeyboardEventHandler, memo, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

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
import { cn, swrFetcher } from "@/lib/utils";

export function AgentSidebar() {
  const router = useRouter();
  const params = useParams();
  const { setOpenMobile, toggleSidebar } = useSidebar();

  const { data, isLoading } = useSWR<AgentSession[]>("/api/agent-sessions", swrFetcher, { fallbackData: [] });

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
        {isLoading ? (
          <Loader size={16} className="animate-spin self-center" />
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {data?.map((chat) => (
                  <ChatItem key={chat.chatId} chat={chat} isActive={chat.chatId === params?.chatId} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
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

  const handleDelete = async () => {
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
      <SidebarMenuButton asChild isActive={isActive}>
        {isEditing ? (
          <div>
            <Input
              ref={inputRef}
              type="text"
              defaultValue={chat.chatName}
              onKeyDown={handleKeyDown}
              onBlur={handleOnBlur}
              className={cn("w-full bg-transparent border-token-border-light p-0.5 h-fit", { hidden: !isEditing })}
              onClick={(e) => e.preventDefault()}
            />
          </div>
        ) : (
          <Link className={cn({ hidden: isEditing })} href={`/chat/${chat.chatId}`} key={chat.chatId} passHref>
            <div title={chat.chatName} className="p-2 truncate hover:bg-muted rounded-md text-sm">
              {chat.chatName}
            </div>
          </Link>
        )}
      </SidebarMenuButton>
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction className="mr-2">
              <MoreHorizontalIcon />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <div className="flex flex-row gap-2 items-center">
                  <Edit size={16} />
                  <span>Edit</span>
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
      )}
    </SidebarMenuItem>
  );
};

const ChatItem = memo(PureChatItem);
