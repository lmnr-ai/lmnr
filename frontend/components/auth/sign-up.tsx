"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import React, { useState } from "react";

import logo from "@/assets/logo/logo.svg";
import { AzureButton } from "@/components/auth/azure-button";
import { EmailSignInButton } from "@/components/auth/email-sign-in";
import { GitHubButton } from "@/components/auth/github-button";
import { GoogleButton } from "@/components/auth/google-button";
import { cn } from "@/lib/utils";

interface SignUpProps {
  callbackUrl: string;
  enableGoogle?: boolean;
  enableGithub?: boolean;
  enableAzure?: boolean;
  enableCredentials?: boolean;
}

type Provider = "github" | "google" | "azure-ad";

const defaultErrorMessage = `Failed to sign in. Please try again.`;

const SignUp = ({ callbackUrl, enableGoogle, enableGithub, enableAzure, enableCredentials }: SignUpProps) => {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState<Provider | string>("");

  const handleSignUp = async (provider: Provider) => {
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
        <span className="text-4xl font-medium">Create an account</span>
        <div className="z-20 flex flex-col items-center gap-y-4 p-8 w-[380px] rounded-lg pt-20 pb-16">
          {enableCredentials && <EmailSignInButton callbackUrl={callbackUrl} />}
          {enableGoogle && (
            <GoogleButton
              onClick={() => handleSignUp("google")}
              isLoading={isLoading === "google"}
              isDisabled={!!isLoading}
            />
          )}
          {enableGithub && (
            <GitHubButton
              onClick={() => handleSignUp("github")}
              isLoading={isLoading === "github"}
              isDisabled={!!isLoading}
              className={cn({
                "w-full": enableCredentials,
              })}
            />
          )}
          {enableAzure && (
            <AzureButton
              onClick={() => handleSignUp("azure-ad")}
              isLoading={isLoading === "azure-ad"}
              isDisabled={!!isLoading}
              className={cn({
                "w-full": enableCredentials,
              })}
            />
          )}
          {error && <span className="text-destructive text-xs mt-4">{defaultErrorMessage}</span>}
        </div>
        <span className="text-secondary-foreground font-medium">
          Already have an account?{" "}
          <Link className="text-primary-foreground" href={{ pathname: "/sign-in", query: { callbackUrl } }}>
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
