'use client';

import { signIn } from 'next-auth/react'

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
  signIn('email', { callbackUrl: callbackUrl, email: 'username@example.com', name: 'username' })

  return (
    <div className='w-full h-full flex items-center'>
      Signing in...
    </div>
  )
}
