"use client";

import { Book, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import DiscordLogo from "@/assets/logo/discord";
import smallLogo from "@/assets/logo/icon.svg";
import fullLogo from "@/assets/logo/logo.svg";
import { getSidebarMenus } from "@/components/project/utils.ts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import AvatarMenu from "../user/avatar-menu";

interface ProjectSidebarProps {
  workspaceId: string;
  projectId: string;
  isFreeTier: boolean;
  gbUsedThisMonth?: number;
  gbLimit?: number;
}

const UsageDisplay = ({
  gbUsed,
  gbLimit,
  workspaceId,
  open,
}: {
  gbUsed: number;
  gbLimit: number;
  workspaceId: string;
  open: boolean;
}) => {
  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(0)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  const usagePercentage = gbLimit > 0 ? Math.min((gbUsed / gbLimit) * 100, 100) : 0;
  const title = `${formatGB(gbUsed)} of ${formatGB(gbLimit)}`;

  if (!open) return null;

  return (
    <div className="mx-4 mb-4 p-3 rounded-lg border bg-muted/30">
      <div className="text-sm text-muted-foreground mb-2">Free plan usage</div>
      <div className="flex flex-col gap-2">
        <div title={title} className="text-xs font-medium truncate">
          {title}
        </div>
        <Progress value={usagePercentage} className="h-1" />
        <Link href={`/workspace/${workspaceId}`}>
          <Button className="w-full h-6 text-xs">Upgrade</Button>
        </Link>
      </div>
    </div>
  );
};

export default function ProjectSidebar({
  workspaceId,
  projectId,
  isFreeTier,
  gbUsedThisMonth = 0,
  gbLimit = 1,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const { open, openMobile } = useSidebar();
  const [showStarCard, setShowStarCard] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showStarCard");
      setShowStarCard(saved !== null ? JSON.parse(saved) : true);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showStarCard", JSON.stringify(showStarCard));
    }
  }, [showStarCard]);

  const options = useMemo(() => {
    const menus = getSidebarMenus(projectId);
    if (!isFreeTier) {
      return menus;
    }
    return menus.filter((m) => m.name !== "events");
  }, [isFreeTier, projectId]);

  return (
    <Sidebar className="border-r" collapsible="icon">
      <SidebarHeader className="h-12 bg-background">
        <Link
          href="/projects"
          className={`flex h-12 items-center ${open || openMobile ? "justify-start pl-2" : "justify-center"}`}
        >
          <Image
            alt="Laminar AI logo"
            src={open || openMobile ? fullLogo : smallLogo}
            width={open || openMobile ? 120 : 20}
            height={open || openMobile ? undefined : 20}
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2 bg-background">
        <SidebarMenu className={cn(open || openMobile ? undefined : "justify-center items-center flex")}>
          {options.map((option, i) => (
            <SidebarMenuItem key={i} className="h-7">
              <SidebarMenuButton
                asChild
                className={cn("flex items-center", open || openMobile ? "" : "justify-center gap-0")}
                isActive={pathname.startsWith(option.href)}
                tooltip={option.name}
              >
                <Link href={option.href}>
                  <option.icon />
                  {open || openMobile ? <span>{option.name}</span> : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <div className="flex-1" />

        {isFreeTier && (open || openMobile) && (
          <UsageDisplay
            gbUsed={gbUsedThisMonth}
            gbLimit={gbLimit}
            workspaceId={workspaceId}
            open={open || openMobile}
          />
        )}

        {showStarCard && open && (
          <div
            className={cn(
              "mx-4 mt-4 p-3 rounded-lg border bg-muted relative",
              open || openMobile ? "text-sm" : "hidden"
            )}
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
      </SidebarContent>
      <SidebarFooter className="bg-background p-4 gap-1">
        <Link
          href="https://discord.gg/nNFUUDAKub"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "h-8 text-secondary-foreground flex items-center gap-2",
            open || openMobile ? "" : "justify-center"
          )}
        >
          <DiscordLogo className="w-5 h-5" />
          {open || openMobile ? <span className="text-sm">Support</span> : null}
        </Link>
        <Link
          href="https://docs.lmnr.ai"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "h-8 text-secondary-foreground flex items-center gap-2 mb-4",
            open || openMobile ? "" : "justify-center"
          )}
        >
          <Book size={16} />
          {open || openMobile ? <span className="text-sm ml-1">Docs</span> : null}
        </Link>
        <AvatarMenu showDetails={open || openMobile} />
      </SidebarFooter>
    </Sidebar>
  );
}
