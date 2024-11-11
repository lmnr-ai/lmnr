'use client';

import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { signOut } from 'next-auth/react';
import { useUserContext } from '@/contexts/user-context';
import Link from 'next/link';

export default function AvatarMenu() {
  const { imageUrl, username } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 overflow-hidden rounded-full border">
            <Image
              src={imageUrl}
              alt="avatar"
              width={28}
              height={28}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-sm text-secondary-foreground hidden group-hover:inline transition-all duration-200 opacity-0 group-hover:opacity-100">
            {username}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
