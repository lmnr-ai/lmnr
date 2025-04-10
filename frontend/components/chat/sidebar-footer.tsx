import { ChevronUp } from "lucide-react";
import Image from "next/image";
import { User } from "next-auth";
import { signOut } from "next-auth/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";
import ChatPricing from "./chat-pricing";
import { useState } from "react";

const AgentSidebarFooter = ({ user }: { user: User }) => {
  const { state } = useSidebar();
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);
  return (
    <SidebarFooter>
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
                <span className="truncate">
                  {user.email} {user.email}
                </span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
              <DropdownMenuItem asChild>
                <button type="button" className="w-full cursor-pointer" onClick={() => setIsBillingDialogOpen(true)}>
                  Billing
                </button>
              </DropdownMenuItem>
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
        <DialogContent>
          <DialogTitle>
            Billing
          </DialogTitle>
          <ChatPricing />
        </DialogContent>
      </Dialog>
    </SidebarFooter>
  );
};

export default AgentSidebarFooter;
