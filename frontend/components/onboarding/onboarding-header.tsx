import Link from 'next/link';
import Image from 'next/image';
import icon from '@/assets/logo/icon_light.svg';
import { ChevronRight } from 'lucide-react';

interface OnboardingHeaderProps {}

export default function OnboardingHeader({}: OnboardingHeaderProps) {
  return (
    <div className="flex items-center h-14 border-b pl-1 space-x-2 pr-4">
      <Link href={'/projects'} className='flex h-10 items-center justify-center'>
        <Image alt='Laminar AI icon' src={icon} width={32} />
      </Link>
      <ChevronRight className="w-5 h-5 text-gray-500" />
      <div className="font-medium flex items-center h-14">
        Create workspace and project
      </div>
    </div>
  );
}
