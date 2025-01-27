'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface EmailSignInProps {
  callbackUrl: string;
}

const validateEmailAddress = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function EmailSignInButton({ callbackUrl }: EmailSignInProps) {
  const [email, setEmail] = useState('');

  return (
    <div className="h-full flex flex-col space-y-2 mb-2 w-[350px]">
      <Label className="text-sm text-white text-center">
        This is a local-only feature. Simply enter any email.
      </Label>
      <Input
        type="email"
        placeholder="Email"
        className="border-white/50 text-white placeholder:text-white/50"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!validateEmailAddress(email) && email && (
        <Label className="text-sm text-white">
          {' '}
          Please enter a valid email address{' '}
        </Label>
      )}
      <Button
        disabled={!email || !validateEmailAddress(email)}
        className="p-4"
        variant={'light'}
        onClick={() => {
          signIn('email', {
            callbackUrl,
            email,
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
