import Image from 'next/image';
import Link from 'next/link';

import icon from '@/assets/logo/icon.png';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Link
        href={'/projects'}
        className="flex h-10 mb-8 items-center justify-center"
      >
        <Image alt="Laminar AI icon" src={icon} width={80} />
      </Link>
      <h1 className="mb-4 text-lg">Page not found</h1>
    </div>
  );
}
