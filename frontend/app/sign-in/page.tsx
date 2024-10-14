import { getServerSession } from 'next-auth';
import logo from '@/assets/logo/laminar_light.svg';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { DefaultSignInButton } from '@/components/sign-in/dummy-signin';
import { GoogleSignInButton } from '@/components/sign-in/google-signin';
import { GitHubSignInButton } from '@/components/sign-in/github-signin';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: {};
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const session = await getServerSession();
  let callbackUrl = searchParams?.callbackUrl ?? '/on-sign-up';
  if (Array.isArray(callbackUrl)) {
    callbackUrl = callbackUrl[0];
  }

  if (session?.user) {
    redirect(callbackUrl);
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className='flex flex-col items-center'>
        <Image alt='' src={logo} width={200} className='mb-16' />
        <h1 className="text-[24px] text-center mb-16">Start building next-gen AI apps now.</h1>
        <DefaultSignInButton callbackUrl={callbackUrl} />
        {process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET &&
          <>
            or
            <GitHubSignInButton className='text-[16px] py-6 px-4 pr-8 mb-4' callbackUrl={callbackUrl} />
          </>
        }
        {process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET &&
        <>
          or
          <GoogleSignInButton className='text-[16px] py-6 px-4 pr-8' callbackUrl={callbackUrl} />
        </>
        }
      </div>
    </div>
  );
}
