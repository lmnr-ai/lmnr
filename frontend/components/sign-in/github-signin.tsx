'use client';

import { signIn } from 'next-auth/react';
import * as React from 'react';
import { useState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { IconGitHub, IconSpinner } from '@/components/ui/icons';

interface GitHubSignInButtonProps extends ButtonProps {
  showGithubIcon?: boolean;
  text?: string;
  callbackUrl: string;
}

export function GitHubSignInButton({
  text = 'Continue with GitHub',
  callbackUrl,
  showGithubIcon = true,
  className,
  ...props
}: GitHubSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      await signIn('github', { callbackUrl });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant={'light'}
        onClick={handleSignIn}
        disabled={isLoading}
        className={className}
        {...props}
      >
        <div className="h-5 w-5">
          {isLoading ? (
            <IconSpinner className="animate-spin" />
          ) : (
            <IconGitHub />
          )}
        </div>
        <div className="ml-4">{text}</div>
      </Button>
    </>
  );
}
