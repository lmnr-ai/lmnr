"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { IconGitHub, IconSpinner } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface GitHubSignInButtonProps extends ButtonProps {
  text?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function GitHubButton({
  text = "Continue with GitHub",
  className,
  onClick,
  isLoading,
  isDisabled,
  ...props
}: GitHubSignInButtonProps) {
  return (
    <Button
      variant={"light"}
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className={cn("text-[16px] py-6 px-4 pr-8 w-full", className)}
      {...props}
    >
      <div className="h-5 w-5">{isLoading ? <IconSpinner className="animate-spin" /> : <IconGitHub />}</div>
      <div className="ml-4">{text}</div>
    </Button>
  );
}
