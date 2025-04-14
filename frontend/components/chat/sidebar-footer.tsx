import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";

import { usePricingContext } from "@/components/chat/pricing-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { ChatUser } from "./types";

const AgentSidebarFooter = ({ user }: { user: ChatUser }) => {
  const { state } = useSidebar();

  const { handleOpen } = usePricingContext();
  return (
    <SidebarFooter>
      <SidebarMenu className="overflow-hidden">
        <SidebarMenuButton
          size="sm"
          className={cn(
            "bg-primary/90 primary text-primary-foreground/90 hover:bg-primary border-white/20 border hover:border-white/50 active:bg-primary",
            {
              hidden: state === "collapsed" || user.userSubscriptionTier.trim().toLowerCase() !== "free",
            }
          )}
          onClick={() => handleOpen(true)}
        >
          <span className="mx-auto">Upgrade to Pro</span>
        </SidebarMenuButton>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className={cn(
                  "transition-all size-full group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!mb-1",
                  state === "collapsed" ? "mx-[5px]" : "mx-0"
                )}
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image} alt="user-image" />
                  <AvatarFallback className="rounded-lg">{user.name?.[0] ?? "L"}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span
                    className={cn(
                      "text-xs truncate text-muted-foreground",
                      user.userSubscriptionTier === "free" ? "text-muted-foreground" : "text-primary"
                    )}
                  >
                    {user.userSubscriptionTier === "free" ? "Free" : "Pro"}
                  </span>
                  <span className="truncate">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
              {user.userSubscriptionTier.trim().toLowerCase() !== "free" && (
                <DropdownMenuItem>
                  <Link href="/checkout/portal" className="w-full cursor-pointer">
                    Manage billing
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  className="w-full cursor-pointer"
                  onClick={() => {
                    signOut({ redirect: true });
                  }}
                >
                  Sign out
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
};

export default AgentSidebarFooter;
