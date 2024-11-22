'use client';

import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';

import { cn } from '@/lib/utils';
import google from '@/assets/logo/google.svg';
import { IconSpinner } from '@/components/ui/icons';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

interface GitHubSignInButtonProps extends ButtonProps {
  showIcon?: boolean;
  text?: string;
  callbackUrl: string;
}

export function GoogleSignInButton({
  text = 'Continue with Google',
  callbackUrl,
  className,
  ...props
}: GitHubSignInButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  return (
    <Button
      variant={'light'}
      onClick={() => {
        setIsLoading(true);
        signIn('google', { callbackUrl: callbackUrl });
      }}
      disabled={isLoading}
      className={cn(className)}
      {...props}
    >
      <div className="h-5 w-5">
        {isLoading ? (
          <IconSpinner className="animate-spin" />
        ) : (
          <Image src={google} alt="Google Icon" width={20} height={20} />
        )}
      </div>
      <div className="ml-4">{text}</div>
    </Button>
  );
}
