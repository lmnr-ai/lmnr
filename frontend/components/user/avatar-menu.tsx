'use client'

import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { signOut } from 'next-auth/react'
import { useUserContext } from '@/contexts/user-context';
import Link from 'next/link';

export default function AvatarMenu() {

  const { imageUrl } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className='flex items-center'>
          <div className="border rounded-full cursor-pointer w-[28px] h-[28px] bg-black" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
