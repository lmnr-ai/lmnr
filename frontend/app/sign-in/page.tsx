import Image from "next/image";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import noise from "@/assets/landing/noise_resized.jpg";
import logo from "@/assets/logo/logo.svg";
import { EmailSignInButton } from "@/components/sign-in/email-signin";
import { GitHubSignInButton } from "@/components/sign-in/github-signin";
import { GoogleSignInButton } from "@/components/sign-in/google-signin";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

export default async function SignInPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession();
  let callbackUrl = searchParams?.callbackUrl ?? "/onboarding";
  if (Array.isArray(callbackUrl)) {
    callbackUrl = callbackUrl[0];
  }

  if (session?.user) {
    redirect(callbackUrl);
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center relative">
        <div className="inset-0 absolute z-10 md:rounded-lg overflow-hidden">
          <Image src={noise} alt="" className="w-full h-full" priority quality={100} />
        </div>
        <div className="z-20 flex flex-col items-center p-16 px-8">
          <Image alt="" src={logo} width={220} className="my-16" />
          {isFeatureEnabled(Feature.EMAIL_AUTH) && <EmailSignInButton callbackUrl={callbackUrl} />}
          {isFeatureEnabled(Feature.GOOGLE_AUTH) && (
            <GoogleSignInButton className="text-[16px] py-6 px-4 pr-8 mt-4" callbackUrl={callbackUrl} />
          )}
          {isFeatureEnabled(Feature.GITHUB_AUTH) && (
            <GitHubSignInButton
              className={cn("text-[16px] py-6 px-4 pr-8 mt-4", {
                "w-full": isFeatureEnabled(Feature.EMAIL_AUTH),
              })}
              callbackUrl={callbackUrl}
            />
          )}
          {!isFeatureEnabled(Feature.EMAIL_AUTH) && (
            <div className="mt-16 text-sm text-secondary-foreground">
              By continuing you agree to our{" "}
              <a href="https://docs.lmnr.ai/policies/privacy-policy" target="_blank" className="underline">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="https://docs.lmnr.ai/policies/terms-of-service" target="_blank" className="underline">
                Terms of Service
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
