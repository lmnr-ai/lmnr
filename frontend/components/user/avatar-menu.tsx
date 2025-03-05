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

interface AvatarMenuProps {
  showDetails?: boolean;
}

export default function AvatarMenu({ showDetails }: AvatarMenuProps) {
  const { imageUrl, email } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="flex items-center gap-2">
          {(imageUrl && imageUrl !== '') ? <Image
            src={imageUrl}
            alt="avatar"
            width={28}
            height={28}
            className="border rounded-full cursor-pointer"
          />
            : <div className="w-7 h-6 bg-slate-500 rounded-full cursor-pointer" />}
          {showDetails && (
            <div className="flex flex-col max-w-[110px]">
              <span className="text-xs truncate text-muted-foreground">{email}</span>
            </div>
          )}
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
