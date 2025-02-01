"use client";

import { Book, Cable, Database, FlaskConical, LayoutGrid, Pen, PlayCircle, Rows4, Settings, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import smallLogo from "@/assets/logo/icon.svg";
import fullLogo from "@/assets/logo/logo.svg";
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

interface ProjectNavBarProps {
  projectId: string;
}

export default function ProjectNavbar({ projectId }: ProjectNavBarProps) {
  const pathname = usePathname();
  const { open, openMobile } = useSidebar();
  const [showStarCard, setShowStarCard] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showStarCard");
      setShowStarCard(saved !== null ? JSON.parse(saved) : true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("showStarCard", JSON.stringify(showStarCard));
  }, [showStarCard]);

  const allOptions = [
    {
      name: "dashboard",
      href: `/projects/${projectId}/dashboard`,
      icon: LayoutGrid,
      current: false,
    },
    {
      name: "traces",
      href: `/projects/${projectId}/traces`,
      icon: Rows4,
      current: false,
    },
    {
      name: "evaluations",
      href: `/projects/${projectId}/evaluations`,
      icon: FlaskConical,
      current: false,
    },
    {
      name: "datasets",
      href: `/projects/${projectId}/datasets`,
      icon: Database,
      current: false,
    },
    {
      name: "queues",
      href: `/projects/${projectId}/labeling-queues`,
      icon: Pen,
      current: false,
    },
    {
      name: "playgrounds",
      href: `/projects/${projectId}/playgrounds`,
      icon: PlayCircle,
      current: false,
    },
    {
      name: "pipelines",
      href: `/projects/${projectId}/pipelines`,
      icon: Cable,
      current: false,
    },
    {
      name: "settings",
      href: `/projects/${projectId}/settings`,
      icon: Settings,
      current: false,
    },
  ];

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
          {allOptions.map((option, i) => (
            <SidebarMenuItem key={i} className="h-7">
              <SidebarMenuButton
                asChild
                className={cn(
                  "text-secondary-foreground flex items-center",
                  open || openMobile ? "" : "justify-center gap-0"
                )}
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
      <SidebarFooter className="bg-background p-4 gap-4">
        <Link
          href="https://docs.lmnr.ai"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "h-8 text-secondary-foreground flex items-center gap-2",
            open || openMobile ? "" : "justify-center"
          )}
        >
          <Book size={16} />
          {open || openMobile ? <span className="text-sm">Docs</span> : null}
        </Link>
        <AvatarMenu showDetails={open || openMobile} />
      </SidebarFooter>
    </Sidebar>
  );
}
