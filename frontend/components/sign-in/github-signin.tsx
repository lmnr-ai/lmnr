"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { IconGitHub, IconSpinner } from "@/components/ui/icons";
import { useToast } from "@/lib/hooks/use-toast";

interface GitHubSignInButtonProps extends ButtonProps {
  showGithubIcon?: boolean;
  text?: string;
  callbackUrl: string;
}

export function GitHubSignInButton({
  text = "Continue with GitHub",
  callbackUrl,
  showGithubIcon = true,
  className,
  ...props
}: GitHubSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      await signIn("github", { callbackUrl });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign in with GitHub. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button variant={"light"} onClick={handleSignIn} disabled={isLoading} className={className} {...props}>
        <div className="h-5 w-5">{isLoading ? <IconSpinner className="animate-spin" /> : <IconGitHub />}</div>
        <div className="ml-4">{text}</div>
      </Button>
    </>
  );
}
