"use client";

import { Book, X } from "lucide-react";
import Link from "next/link";
import React from "react";

import DiscordLogo from "@/assets/logo/discord.tsx";
import { LaminarIcon, LaminarLogo } from "@/components/ui/icons.tsx";
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { cn } from "@/lib/utils.ts";

const SidebarFooterComponent = () => {
  const { open, openMobile } = useSidebar();
  const [showStarCard, setShowStarCard] = useLocalStorage("showStarCard", true);

  return (
    <SidebarFooter className="px-0 mb-2">
      <SidebarGroup className={cn((open || openMobile) && showStarCard ? "text-sm" : "hidden")}>
        <SidebarGroupContent>
          <div className={cn("flex flex-col rounded-lg border bg-muted relative p-2")}>
            <div className="flex justify-between items-start">
              <p className="text-xs text-muted-foreground mb-2">Laminar is fully open source</p>
              <button onClick={() => setShowStarCard(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <a
              href="https://github.com/lmnr-ai/lmnr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground hover:underline"
            >
              ⭐ Star it on GitHub
            </a>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem className="h-7">
              <SidebarMenuButton tooltip="Discord" asChild>
                <Link href="https://discord.gg/nNFUUDAKub" target="_blank" rel="noopener noreferrer">
                  <DiscordLogo className="w-4 h-4" />
                  <span>Support</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Docs" asChild>
                <Link href="https://docs.lmnr.ai" target="_blank" rel="noopener noreferrer">
                  <Book size={16} />
                  <span>Docs</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem className="mt-4 mx-0 px-2">
              <Link passHref href="/projects" className="flex items-center">
                <div className="relative flex">
                  <LaminarIcon
                    className={cn(
                      "w-4 h-4 transition-all duration-300 ease-in-out",
                      open || openMobile ? "opacity-0 scale-50 absolute" : "opacity-100 scale-100"
                    )}
                    fill="#5B5B5B"
                  />

                  <LaminarLogo
                    fill="#5B5B5B"
                    className={cn(
                      "w-30 h-5 text-secondary transition-all duration-300 ease-in-out",
                      open || openMobile ? "opacity-100 scale-100" : "opacity-0 scale-50 absolute"
                    )}
                  />
                </div>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarFooter>
  );
};

export default SidebarFooterComponent;
