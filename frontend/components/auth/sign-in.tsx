"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import { AuthFooter } from "@/components/auth/auth-footer";
import { AuthProviderButtons } from "@/components/auth/auth-provider-buttons";
import { track } from "@/lib/posthog";

interface SignInProps {
  callbackUrl: string;
}

const SignIn = ({ callbackUrl }: SignInProps) => {
  useEffect(() => {
    track("auth", "sign_in_page_viewed");
  }, []);

  return (
    <div className="flex flex-1 flex-col h-full py-4 px-5 bg-surface-700">
      <Link href="/" className="block shrink-0 self-start">
        <Image alt="Laminar logo" src={logo} className="w-25 h-auto" priority />
      </Link>
      <div className="flex flex-1 justify-center flex-col items-center relative rounded-lg">
        <span className="text-4xl font-medium font-sans-landing">Welcome Back</span>
        <div className="z-20 flex flex-col items-center gap-y-4 p-8 w-100 rounded-lg pt-16 pb-16">
          <AuthProviderButtons callbackUrl={callbackUrl} trackAction="sign_in_attempted" />
        </div>
        <span className="text-muted-foreground font-medium text-sm">
          Don&#39;t have an account?{" "}
          <Link className="text-secondary-foreground" href={{ pathname: "/sign-up", query: { callbackUrl } }}>
            Create one
          </Link>
        </span>
      </div>
      <AuthFooter />
    </div>
  );
};

export default SignIn;
