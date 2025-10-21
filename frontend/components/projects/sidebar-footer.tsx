import { Book, X } from "lucide-react";
import Link from "next/link";
import React from "react";

import DiscordLogo from "@/assets/logo/discord.tsx";
import { LaminarLogo } from "@/components/ui/icons.tsx";
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
      <SidebarGroup>
        <SidebarGroupContent>
          {showStarCard && open && (
            <div
              className={cn("rounded-lg border bg-muted relative p-2 m-2", open || openMobile ? "text-sm" : "hidden")}
            >
              <button
                onClick={() => setShowStarCard(false)}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
              <p className="text-xs text-muted-foreground mb-2">Laminar is fully open source</p>
              <a
                href="https://github.com/lmnr-ai/lmnr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-foreground hover:underline"
              >
                ⭐ Star it on GitHub
              </a>
            </div>
          )}
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
            <SidebarMenuItem className="mt-2">
              <Link
                href="/projects"
                className={`flex items-center ${open || openMobile ? "justify-center" : "justify-center"}`}
              >
                <LaminarLogo fill="#b5b5b5" className="w-[144px] h-6 text-secondary" />
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarFooter>
  );
};

export default SidebarFooterComponent;
