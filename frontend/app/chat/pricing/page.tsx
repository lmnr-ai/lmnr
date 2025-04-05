import { Metadata } from 'next';
import { getServerSession } from 'next-auth';

import ChatPricing from '@/components/chat/chat-pricing';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';
export const metadata: Metadata = {
  title: 'Pricing – Laminar'
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) {
    redirect('/sign-in?callbackUrl=/chat/pricing');
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, user.email!),
    with: {
      userSubscriptionTier: true
    }
  });

  return (
    <>
      <ChatPricing userTier={dbUser!.userSubscriptionTier.name} userId={dbUser!.id} />
    </>
  );
}
