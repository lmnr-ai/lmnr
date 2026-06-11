"use client";

import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { IconSpinner } from "@/components/ui/icons";

interface ProviderButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

// One OAuth provider button. The per-provider components (Google/GitHub/Azure/
// Okta/Keycloak) differed only by icon + label, so they collapse into this.
export function ProviderButton({ icon, label, onClick, isLoading, isDisabled }: ProviderButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className="text-[16px] py-6 px-4 pr-6 w-full bg-landing-surface-400 hover:bg-landing-surface-500"
    >
      <div className="h-5 w-5">{isLoading ? <IconSpinner className="animate-spin" /> : icon}</div>
      <div className="ml-2">{label}</div>
    </Button>
  );
}
