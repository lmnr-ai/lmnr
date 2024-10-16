'use client';

import { signIn } from 'next-auth/react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useState } from 'react';
import { Label } from '../ui/label';

interface EmailSignInProps {
  showIcon?: boolean;
  text?: string;
  callbackUrl: string;
  className?: string;
}

export function EmailSignInButton({
  text = 'Sign in',
  callbackUrl,
  className,
  ...props
}: EmailSignInProps) {
  const [email, setEmail] = useState('');

  return (
    <div className="h-full flex flex-col space-y-2 mb-2 w-[350px]">
      <Label className="text-sm text-gray-500">
        This is a local-only feature. Simply put any email.
      </Label>
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        disabled={!email}
        className="p-4"
        onClick={() => {
          signIn('email', {
            callbackUrl: callbackUrl,
            email: email,
            name: email
          });
        }}
        handleEnter
      >
        Sign in
      </Button>
    </div>
  );
}
