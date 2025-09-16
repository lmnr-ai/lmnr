// app/providers.tsx
'use client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

if (typeof window !== 'undefined') {
  posthog.init('phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7', {
    api_host: 'https://p.laminar.sh',
    person_profiles: 'identified_only'
  });
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
