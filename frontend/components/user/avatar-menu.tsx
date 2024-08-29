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
          <Image src={imageUrl} alt="avatar" width={28} height={28} className="border rounded-full cursor-pointer" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Link href={`/profile/usage`}>
          <DropdownMenuItem>
            Usage & billing
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
