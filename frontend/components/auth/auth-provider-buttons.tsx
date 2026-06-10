"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import googleLogo from "@/assets/logo/google.svg";
import keycloakLogo from "@/assets/logo/keycloak.svg";
import microsoftLogo from "@/assets/logo/microsoft.svg";
import oktaLogo from "@/assets/logo/okta.svg";
import { EmailSignInButton } from "@/components/auth/email-sign-in";
import { ProviderButton } from "@/components/auth/provider-button";
import { IconGitHub } from "@/components/ui/icons";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type AuthProvider, signInWithProvider } from "@/lib/auth-client";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";

const defaultErrorMessage = `Failed to sign in. Please try again.`;

interface Props {
  callbackUrl: string;
  // The two pages differ only here:
  //  - trackAction: the posthog event for OAuth + email attempts.
  //  - errorPath: where signInWithProvider routes IdP/callback failures
  //    (defaults to /sign-in; sign-up passes /sign-up so errors land there).
  trackAction: "sign_in_attempted" | "sign_up_attempted";
  errorPath?: string;
}

export function AuthProviderButtons({ callbackUrl, trackAction, errorPath }: Props) {
  const featureFlags = useFeatureFlags();
  const enableCredentials = featureFlags[Feature.EMAIL_AUTH];
  const enableGithub = featureFlags[Feature.GITHUB_AUTH];
  const enableGoogle = featureFlags[Feature.GOOGLE_AUTH];
  const enableAzure = featureFlags[Feature.AZURE_AUTH];
  const enableOkta = featureFlags[Feature.OKTA_AUTH];
  const enableKeycloak = featureFlags[Feature.KEYCLOAK_AUTH];
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error"));
  const [isLoading, setIsLoading] = useState<AuthProvider | string>("");

  const handleClick = async (provider: AuthProvider) => {
    try {
      setIsLoading(provider);
      // sendInstantly bypasses posthog-js's batching queue — `signIn` triggers
      // a window.location redirect almost immediately, which would otherwise
      // drop the queued event.
      track("auth", trackAction, { provider }, { sendInstantly: true });
      const { error: signInError } = await signInWithProvider(provider, callbackUrl, errorPath);

      if (signInError) {
        setError(signInError.message || defaultErrorMessage);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : defaultErrorMessage);
    } finally {
      setIsLoading("");
    }
  };

  // Returns just the buttons; each page keeps its own wrapper (the two pages tune
  // that wrapper's padding/background independently).
  return (
    <>
      {enableCredentials && (
        <EmailSignInButton className="mb-6 w-full" callbackUrl={callbackUrl} action={trackAction} />
      )}
      {enableGoogle && (
        <ProviderButton
          icon={<Image src={googleLogo} alt="Google" width={20} height={20} />}
          label="Continue with Google"
          onClick={() => handleClick("google")}
          isLoading={isLoading === "google"}
          isDisabled={!!isLoading}
        />
      )}
      {enableGithub && (
        <ProviderButton
          icon={<IconGitHub />}
          label="Continue with GitHub"
          onClick={() => handleClick("github")}
          isLoading={isLoading === "github"}
          isDisabled={!!isLoading}
        />
      )}
      {enableAzure && (
        <ProviderButton
          icon={<Image src={microsoftLogo} alt="Microsoft" width={20} height={20} />}
          label="Continue with Microsoft"
          onClick={() => handleClick("microsoft-entra-id")}
          isLoading={isLoading === "microsoft-entra-id"}
          isDisabled={!!isLoading}
        />
      )}
      {enableOkta && (
        <ProviderButton
          icon={<Image src={oktaLogo} alt="Okta" width={20} height={20} />}
          label="Continue with Okta"
          onClick={() => handleClick("okta")}
          isLoading={isLoading === "okta"}
          isDisabled={!!isLoading}
        />
      )}
      {enableKeycloak && (
        <ProviderButton
          icon={<Image src={keycloakLogo} alt="Keycloak" width={20} height={20} />}
          label="Continue with Keycloak"
          onClick={() => handleClick("keycloak")}
          isLoading={isLoading === "keycloak"}
          isDisabled={!!isLoading}
        />
      )}
      {error && <span className="text-destructive text-xs mt-4">{defaultErrorMessage}</span>}
    </>
  );
}
