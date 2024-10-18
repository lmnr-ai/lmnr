// app/posthog.js
import { PostHog } from 'posthog-node';

export default function PostHogClient() {
  const posthogClient = new PostHog(
    'phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7',
    {
      host: 'https://us.i.posthog.com'
    }
  );
  return posthogClient;
}
