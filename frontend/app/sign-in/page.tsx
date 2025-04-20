import Image from "next/image";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

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
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center relative rounded-lg">
          <div className="z-20 flex flex-col items-center p-8 w-[400px]">
            <Image alt="Logo" src={logo} width={200} className="mb-16" />

            {isFeatureEnabled(Feature.EMAIL_AUTH) && <EmailSignInButton callbackUrl={callbackUrl} />}
            {isFeatureEnabled(Feature.GOOGLE_AUTH) && (
              <GoogleSignInButton className="text-[16px] py-6 px-4 pr-8 mt-4 w-full" callbackUrl={callbackUrl} />
            )}
            {isFeatureEnabled(Feature.GITHUB_AUTH) && (
              <GitHubSignInButton
                className={cn("text-[16px] py-6 px-4 pr-8 mt-4 w-full", {
                  "w-full": isFeatureEnabled(Feature.EMAIL_AUTH),
                })}
                callbackUrl={callbackUrl}
              />
            )}
          </div>
        </div>
      </div>
      <footer className="p-6 flex justify-center">
        {!isFeatureEnabled(Feature.EMAIL_AUTH) && (
          <div className="text-sm font-medium text-white/70">
            By continuing you agree to our{" "}
            <a href="https://docs.lmnr.ai/policies/privacy-policy" target="_blank" className="text-white">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="https://docs.lmnr.ai/policies/terms-of-service" target="_blank" className="text-white">
              Terms of Service
            </a>
          </div>
        )}
      </footer>
    </div>
  );
}
