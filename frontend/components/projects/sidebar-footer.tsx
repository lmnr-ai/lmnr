"use client";

import { Book } from "lucide-react";
import Link from "next/link";

import laminarIcon from "@/assets/logo/icon.svg";
import laminarWordmark from "@/assets/logo/laminar-wordmark.svg";
import VersionBadge from "@/components/common/version-badge.tsx";
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { cn } from "@/lib/utils.ts";

const SidebarFooterComponent = () => {
  const { open, openMobile } = useSidebar();
  const features = useFeatureFlags();
  const logo = open || openMobile ? laminarWordmark : laminarIcon;

  return (
    <SidebarFooter className="px-0">
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Docs" asChild>
                <Link href="https://laminar.sh/docs" target="_blank" rel="noopener noreferrer">
                  <Book size={16} />
                  <span>Docs</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem className="mt-4 mx-0 px-2">
              <Link passHref href="/projects" className="flex items-center">
                {/* mask + bg tint: the SVGs are hard fill="white", so next/image can't be recolored */}
                <span
                  aria-label="Laminar"
                  className={cn("block bg-secondary-foreground/30", open || openMobile ? "w-30" : "w-[35px]")}
                  style={{
                    maskImage: `url(${logo.src})`,
                    WebkitMaskImage: `url(${logo.src})`,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                    aspectRatio: `${logo.width} / ${logo.height}`,
                  }}
                />
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {(open || openMobile) && !features.LAMINAR_CLOUD && (
        <div className="px-5 flex">
          <VersionBadge />
        </div>
      )}
    </SidebarFooter>
  );
};

export default SidebarFooterComponent;
