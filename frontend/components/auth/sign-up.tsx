"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import { AuthProviderButtons } from "@/components/auth/auth-provider-buttons";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";

interface SignUpProps {
  callbackUrl: string;
}

const SignUp = ({ callbackUrl }: SignUpProps) => {
  const enableCredentials = useFeatureFlags()[Feature.EMAIL_AUTH];

  useEffect(() => {
    track("auth", "sign_up_page_viewed");
  }, []);

  return (
    <div className="flex flex-1 flex-col h-full py-4 px-5 bg-surface-700">
      <Link href="/" className="block shrink-0 self-start">
        <Image alt="Laminar logo" src={logo} className="w-[100px] h-auto" priority />
      </Link>
      <div className="flex flex-1 justify-center flex-col items-center relative rounded-lg">
        <span className="text-4xl font-medium font-sans-landing">Create an account</span>
        <div className="z-20 flex flex-col items-center gap-y-4 p-8 w-[400px] rounded-lg pt-16 pb-16">
          {/* Route OAuth callback failures back to /sign-up so errors surface here. */}
          <AuthProviderButtons callbackUrl={callbackUrl} trackAction="sign_up_attempted" errorPath="/sign-up" />
        </div>
        <span className="text-muted-foreground font-medium text-sm">
          Already have an account?{" "}
          <Link className="text-secondary-foreground" href={{ pathname: "/sign-in", query: { callbackUrl } }}>
            Sign in
          </Link>
        </span>
      </div>
      <footer className="p-6 flex justify-center">
        {!enableCredentials && (
          <div className="text-sm font-medium text-white/70">
            By continuing you agree to our{" "}
            <a href="/policies/privacy" target="_blank" className="text-white">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/policies/terms" target="_blank" className="text-white">
              Terms of Service
            </a>
          </div>
        )}
      </footer>
    </div>
  );
};

export default SignUp;
