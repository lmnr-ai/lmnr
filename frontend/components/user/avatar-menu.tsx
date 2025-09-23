"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { posthog } from "posthog-js";

import { Button } from "@/components/ui/button.tsx";
import { useUserContext } from "@/contexts/user-context";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

interface AvatarMenuProps {
  showDetails?: boolean;
}

export default function AvatarMenu({ showDetails }: AvatarMenuProps) {
  const { imageUrl, email } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <div className="flex items-center justify-start gap-2">
            {imageUrl && imageUrl !== "" ? (
              <Image
                src={imageUrl}
                alt="avatar"
                width={28}
                height={28}
                className="border rounded-full cursor-pointer"
              />
            ) : (
              <div className="w-6 h-6 bg-slate-500 rounded-full cursor-pointer" />
            )}
            {showDetails && <span className="text-xs truncate text-muted-foreground min-w-0">{email}</span>}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            posthog.reset();
            signOut({ callbackUrl: "/" });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
