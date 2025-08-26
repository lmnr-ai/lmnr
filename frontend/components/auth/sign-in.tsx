"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import React, { useState } from "react";

import logo from "@/assets/logo/logo.svg";
import { AzureButton } from "@/components/auth/azure-button";
import { EmailSignInButton } from "@/components/auth/email-sign-in";
import { GitHubButton } from "@/components/auth/github-button";
import { GoogleButton } from "@/components/auth/google-button";
import { cn } from "@/lib/utils";

interface SignInProps {
  callbackUrl: string;
  enableGoogle?: boolean;
  enableGithub?: boolean;
  enableAzure?: boolean;
  enableCredentials?: boolean;
}

type Provider = "github" | "google" | "azure-ad";

const defaultErrorMessage = `Failed to sign in. Please try again.`;

const SignIn = ({ callbackUrl, enableGoogle, enableGithub, enableAzure, enableCredentials }: SignInProps) => {
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error"));
  const [isLoading, setIsLoading] = useState<Provider | string>("");

  const handleSignIn = async (provider: Provider) => {
    try {
      setIsLoading(provider);
      const result = await signIn(provider, { callbackUrl });

      if (result && !result.ok) {
        setError(result?.error || defaultErrorMessage);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : defaultErrorMessage;
      setError(errorMessage);
    } finally {
      setIsLoading("");
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full">
      <Link className="p-4 self-start" href="/">
        <Image alt="Logo" src={logo} width={120} />
      </Link>
      <div className="flex flex-1 justify-center flex-col items-center relative rounded-lg">
        <span className="text-4xl font-medium">Welcome Back</span>
        <div className="z-20 flex flex-col items-center gap-y-4 p-8 w-[380px] rounded-lg pt-20 pb-16">
          {enableCredentials && <EmailSignInButton callbackUrl={callbackUrl} />}
          {enableGoogle && (
            <GoogleButton
              onClick={() => handleSignIn("google")}
              isLoading={isLoading === "google"}
              isDisabled={!!isLoading}
              callbackUrl={callbackUrl}
            />
          )}
          {enableGithub && (
            <GitHubButton
              onClick={() => handleSignIn("github")}
              isLoading={isLoading === "github"}
              isDisabled={!!isLoading}
              className={cn({
                "w-full": enableCredentials,
              })}
              callbackUrl={callbackUrl}
            />
          )}
          {enableAzure && (
            <AzureButton
              onClick={() => handleSignIn("azure-ad")}
              isLoading={isLoading === "azure-ad"}
              isDisabled={!!isLoading}
              className={cn({
                "w-full": enableCredentials,
              })}
              callbackUrl={callbackUrl}
            />
          )}
          {error && <span className="text-destructive text-xs mt-4">{defaultErrorMessage}</span>}
        </div>
        <span className="text-secondary-foreground font-medium">
          Don&#39;t have an account?{" "}
          <Link className="text-primary-foreground" href={{ pathname: "/sign-up", query: { callbackUrl } }}>
            Create one
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

export default SignIn;
