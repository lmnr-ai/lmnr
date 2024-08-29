'use client'

import * as React from 'react'
import { signIn } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { IconGitHub, IconSpinner } from '@/components/ui/icons'

interface GitHubSignInButtonProps extends ButtonProps {
  showGithubIcon?: boolean
  text?: string
  callbackUrl: string
}

export function GitHubSignInButton({
  text = 'Continue with GitHub',
  callbackUrl,
  showGithubIcon = true,
  className,
  ...props
}: GitHubSignInButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  return (
    <Button
      variant={"secondary"}
      onClick={() => {
        setIsLoading(true)
        signIn('github', { callbackUrl: callbackUrl })
      }}
      disabled={isLoading}
      className={cn(className)}
      {...props}
    >
      <div className='h-5 w-5'>
        {isLoading
          ? (
            <IconSpinner className="animate-spin" />
          )
          : showGithubIcon
            ? (
              <IconGitHub className="" />
            )
            : null}
      </div>
      <div className='ml-4'>{text}</div>

    </Button>
  )
}
