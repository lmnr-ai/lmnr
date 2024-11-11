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
import { useMemo } from 'react';

export default function AvatarMenu() {
  const { imageUrl, username } = useUserContext();

  const bgColor = useMemo(() => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-orange-500',
      'bg-red-500',
      'bg-indigo-500'
    ];
    // Use username as seed for consistent color
    const colorIndex = username ? username.length % colors.length : 0;
    return colors[colorIndex];
  }, [username]);

  const firstLetter = username ? username.charAt(0).toUpperCase() : '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 overflow-hidden rounded-full border">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="avatar"
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className={`h-full w-full flex items-center justify-center ${bgColor} text-white font-medium`}
              >
                {firstLetter}
              </div>
            )}
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
