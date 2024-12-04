import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import icon from '@/assets/logo/icon.svg';

interface OnboardingHeaderProps { }

export default function OnboardingHeader({ }: OnboardingHeaderProps) {
  return (
    <div className="flex items-center h-14 border-b space-x-2 px-4">
      <Link
        href={'/projects'}
        className="flex h-10 items-center justify-center"
      >
        <Image alt="Laminar AI icon" src={icon} width={20} />
      </Link>
      <ChevronRight className="w-5 h-5 text-gray-500" />
      <div className="font-medium flex items-center h-14">
        Create workspace and project
      </div>
    </div>
  );
}
