import { fetcher } from '../utils';

export const LOOKUP_KEY_TO_TIER_NAME: Record<string, string> = {
  pro_monthly_2024_09: 'Laminar Pro tier',
  pro_monthly_2025_02: 'Laminar Pro tier',
  team_monthly_2024_11: 'Laminar Team tier',
  team_monthly_2025_02: 'Laminar Team tier',
  additional_seat_2024_11: 'Additional seat'
};

export function isLookupKeyForAdditionalSeats(lookupKey: string | null): boolean {
  return lookupKey?.startsWith('additional_seat') ?? false;
}

export interface ItemDescription {
  productDescription: string;
  shortDescription?: string;
  quantity?: number;
}


interface ManageSubscriptionEventArgs {
  stripeCustomerId: string;
  productId: string;
  workspaceId: string;
  subscriptionId: string;
  quantity?: number;
  cancel?: boolean;
  isAdditionalSeats?: boolean;
}


export async function manageSubscriptionEvent({
  stripeCustomerId,
  productId,
  subscriptionId,
  workspaceId,
  quantity,
  cancel,
  isAdditionalSeats
}: ManageSubscriptionEventArgs) {
  await fetcher('/manage-subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SHARED_SECRET_TOKEN}`
    },
    body: JSON.stringify({
      stripeCustomerId,
      productId,
      quantity,
      cancel,
      workspaceId,
      isAdditionalSeats,
      subscriptionId
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
