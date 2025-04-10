import { ChevronUp } from "lucide-react";
import Image from "next/image";
import { signOut } from "next-auth/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn, swrFetcher } from "@/lib/utils";

import { Dialog, DialogContent } from "../ui/dialog";
import ChatPricing from "./chat-pricing";
import { useState } from "react";
import useSWR from "swr";
import { ChatUser } from "./types";
import { Button } from "../ui/button";

const AgentSidebarFooter = ({ user }: { user: ChatUser }) => {
  const { state } = useSidebar();
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);

  return (
    <SidebarFooter>
      {user.userSubscriptionTier === "free" && (
        <div className="flex items-center justify-center w-full h-full px-2">
          <Button
            className="w-full"
            onClick={() => {
              setIsBillingDialogOpen(true);
            }}
          >
            Upgrade to Pro
          </Button>
        </div>
      )}
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className={cn("w-[223px] flex items-center", {
                  "mx-0 ml-[2px]": state === "collapsed",
                })}
              >
                {user.image && (
                  <Image
                    src={user.image}
                    alt="user-image"
                    width={24}
                    height={24}
                    className="rounded-full object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <div className="text-xs text-muted-foreground">
                    {user.userSubscriptionTier === "free" ? "Free" : <span className="text-primary">Pro</span>}
                  </div>
                  <span className="truncate">
                    {user.email}
                  </span>
                </div>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
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
      <Dialog open={isBillingDialogOpen} onOpenChange={setIsBillingDialogOpen}>
        <DialogContent className="max-w-[60vw] min-h-[80vh]">
          <ChatPricing />
        </DialogContent>
      </Dialog>
    </SidebarFooter>
  );
};

export default AgentSidebarFooter;
