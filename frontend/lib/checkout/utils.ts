import { fetcher } from '../utils';

export const LOOKUP_KEY_TO_TIER_NAME: Record<string, string> = {
  pro_monthly_2024_09: 'Laminar Pro tier'
};

export async function manageSubscriptionEvent(
  stripeCustomerId: string,
  productId: string,
  workspaceId: string,
  quantity?: number,
  cancel?: boolean,
  isAdditionalSeats?: boolean
) {
  await fetcher('/manage-subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      stripeCustomerId,
      productId,
      quantity,
      cancel,
      workspaceId,
      isAdditionalSeats
    })
  });
}

export const getIdFromStripeObject = (
  stripeObject: string | { id: string } | null
): string | undefined => {
  if (typeof stripeObject === 'string') {
    return stripeObject;
  }
  return stripeObject?.id;
};
