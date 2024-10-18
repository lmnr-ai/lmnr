import { getServerSession } from 'next-auth';
import { GitHubSignInButton } from '@/components/sign-in/github-signin';
import logo from '@/assets/logo/laminar_light.svg';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/sign-in/google-signin';
import { redirect } from 'next/navigation';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { EmailSignInButton } from '@/components/sign-in/email-signin';

export default async function SignInPage({
  params,
  searchParams
}: {
  params: {};
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession();
  let callbackUrl = searchParams?.callbackUrl ?? '/onboarding';
  if (Array.isArray(callbackUrl)) {
    callbackUrl = callbackUrl[0];
  }

  if (session?.user) {
    redirect(callbackUrl);
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center">
        <Image alt="" src={logo} width={200} className="mb-16" />
        <h1 className="text-2xl text-center mb-16">
          LLM engineering from first principles.
        </h1>
        {isFeatureEnabled(Feature.EMAIL_AUTH) && (
          <EmailSignInButton
            className="text-[16px] py-6 px-4 pr-8 mb-4"
            callbackUrl={callbackUrl}
          />
        )}
        {isFeatureEnabled(Feature.GOOGLE_AUTH) && (
          <GoogleSignInButton
            className="text-[16px] py-6 px-4 pr-8 mb-4"
            callbackUrl={callbackUrl}
          />
        )}
        {isFeatureEnabled(Feature.GITHUB_AUTH) && (
          <GitHubSignInButton
            className="text-[16px] py-6 px-4 pr-8"
            callbackUrl={callbackUrl}
          />
        )}
        {!isFeatureEnabled(Feature.EMAIL_AUTH) && (
          <div className="mt-16 text-sm text-gray-500">
            By continuing you agree to our{' '}
            <a
              href="https://docs.lmnr.ai/policies/privacy-policy"
              target="_blank"
              className="underline"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://docs.lmnr.ai/policies/terms-of-service"
              target="_blank"
              className="underline"
            >
              Terms of Service
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
