import CheckoutSuccess from '@/components/checkout/checkout-success';
import LandingHeader from '@/components/landing/landing-header';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';

export default async function CheckoutSuccessPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);

  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <CheckoutSuccess
        sessionId={searchParams?.sessionId as string}
        lookupKey={searchParams?.lookupKey as string}
        workspaceId={searchParams?.workspaceId as string}
        workspaceName={searchParams?.workspaceName as string}
      />
    </>
  );
}
