import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

import { db } from '@/lib/db/drizzle';
import { workspaces } from '@/lib/db/migrations/schema';
import { isCurrentUserMemberOfWorkspace } from '@/lib/db/utils';

const SEAT_PRICE_LOOKUP_KEY = 'additional_seat_2024_11';

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
): Promise<Response> {
  if (!(await isCurrentUserMemberOfWorkspace(params.workspaceId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, params.workspaceId),
    with: {
      subscriptionTier: {
        columns: {
          membersPerWorkspace: true
        }
      }
    }
  });

  if (!workspace) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 });
  }

  if (!workspace.subscriptionId) {
    return Response.json(
      { error: 'Cannot find subscription id for workspace' },
      { status: 403 }
    );
  }

  const prices = await s.prices.list({
    lookup_keys: [SEAT_PRICE_LOOKUP_KEY]
  });
  const priceId =
    prices.data.find(p => p.lookup_key === SEAT_PRICE_LOOKUP_KEY)?.id!;

  const subscriptionItems = await s.subscriptionItems.list({
    subscription: workspace.subscriptionId
  });
  const existingItem = subscriptionItems.data.find(item => item.price.lookup_key === SEAT_PRICE_LOOKUP_KEY);

  const existingSeats = existingItem ? existingItem.quantity : 0;
  const body = await req.json();
  const newQuantity = Math.max(0, body.quantity + existingSeats);

  if (existingItem) {
    await s.subscriptionItems.update(existingItem.id, {
      price: priceId,
      quantity: newQuantity,
      proration_behavior: 'always_invoice',
    });
  } else {
    await s.subscriptionItems.create({
      subscription: workspace.subscriptionId,
      price: priceId,
      quantity: newQuantity,
      proration_behavior: 'always_invoice',
    });
  }

  return Response.json({ message: 'Seats bought' }, { status: 200 });
}
