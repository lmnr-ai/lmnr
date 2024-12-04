'use client';

import Image from 'next/image';
import { signOut } from 'next-auth/react';

import { useUserContext } from '@/contexts/user-context';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';


export default function AvatarMenu() {
  const { imageUrl } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="flex items-center">
          <Image
            src={imageUrl}
            alt="avatar"
            width={28}
            height={28}
            className="border rounded-full cursor-pointer"
          />
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
