// components/analytics/PostHogIdentifier.tsx
'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'

interface PostHogIdentifierProps {
  email: string
}

export default function PostHogIdentifier({ email }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    // This runs in the browser and connects the current session with the user
    if (email && posthog) {
      posthog.identify(email, {
        email: email,
      })
      console.log("identified", email)
    }
  }, [email])

  return null // This component doesn't render anything
}