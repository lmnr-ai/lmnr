import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PresenceUser } from '@/lib/user/types';

interface PresenceUserImageProps {
  presenceUser: PresenceUser;
}

export default function PresenceUser({ presenceUser }: PresenceUserImageProps) {
  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <TooltipTrigger>
          <div className='flex items-center'>
            <Image src={presenceUser.imageUrl} alt="avatar" width={28} height={28} className="border-pink-400 border-2 rounded-full cursor-pointer" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{presenceUser.username}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
