'use client'

import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useUserContext } from '@/contexts/user-context';
import Link from 'next/link';

export default function AvatarMenu() {

  // const { imageUrl } = useUserContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className='flex items-center'>
          <div className="w-8 h-8 bg-blue-300 rounded-full"></div>
          {/* <Image src={imageUrl} alt="avatar" width={28} height={28} className="border rounded-full cursor-pointer" /> */}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Link href={`/profile/usage`}>
          <DropdownMenuItem>
            Usage & billing
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
