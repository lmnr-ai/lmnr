'use client';

import { signIn } from 'next-auth/react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useState } from 'react';

interface DefaultSigninProps {
  showIcon?: boolean
  text?: string
  callbackUrl: string
  className?: string
}

export function DefaultSignInButton({
  text = 'Sign in',
  callbackUrl,
  className,
  ...props
}: DefaultSigninProps) {
  const [email, setEmail] = useState('');

  return (
    <div className='w-full h-full flex flex-col space-y-2 mb-2 items-center'>
      <Input
        type='email'
        placeholder='Email'
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        disabled={!email}
        className="p-4"
        onClick={() => {
          signIn('email', { callbackUrl: callbackUrl, email: email, name: email });
        }}
        variant="secondary"
        handleEnter
      >
        Sign in
      </Button>
    </div>
  );
}
