import Link from "next/link";
import Image from 'next/image';
import icon from '@/assets/logo/icon_light.svg';

export default function InternalError() {
  return (
    <div>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Link href={'/projects'} className='flex h-10 mb-8 items-center justify-center'>
          <Image alt='Laminar AI icon' src={icon} width={80} />
        </Link>
        <h1 className="mb-4 text-lg">Oops, something went wrong</h1>
      </div>
    </div>
  )
}
