import { getServerSession } from 'next-auth'
import logo from '@/assets/logo/laminar_light.svg'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { DefaultSignInButton } from '@/components/sign-in/dummy-signin';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: {};
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const session = await getServerSession()
  let callbackUrl = searchParams?.callbackUrl ?? '/projects';
  if (Array.isArray(callbackUrl)) {
    callbackUrl = callbackUrl[0]
  }

  if (session?.user) {
    redirect(callbackUrl)
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className='flex flex-col items-center'>
        <Image alt='' src={logo} width={200} className='mb-16' />
        <h1 className="text-[24px] text-center mb-16">Start building next-gen AI apps now.</h1>
        <DefaultSignInButton callbackUrl={callbackUrl} />
      </div>
    </div>
  )
}
