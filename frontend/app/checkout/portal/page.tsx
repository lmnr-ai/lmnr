import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import BillingPage from "@/components/billing/billing-page";
import { getWorkspaceInfo } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { getSubscriptionDetails, getUpcomingInvoice } from "@/lib/checkout/actions";

export const metadata: Metadata = {
  title: "Billing - Laminar",
  description: "Manage your Laminar subscription and billing.",
};

export default async function CheckoutPortalPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const userSession = await getServerSession(authOptions);
  if (!userSession) {
    redirect("/sign-in?callbackUrl=/checkout/portal");
  }

  const workspaceId = searchParams?.workspaceId as string | undefined;
  const workspaceName = (searchParams?.workspaceName as string) ?? "";

  if (!workspaceId) {
    redirect("/projects");
  }

  const [subscription, upcomingInvoice, workspace] = await Promise.all([
    getSubscriptionDetails(workspaceId),
    getUpcomingInvoice(workspaceId),
    getWorkspaceInfo(workspaceId),
  ]);

  const hasDataplaneAddon = workspace.addons.includes("data-plane");

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription, payment methods, and view upcoming invoices.
        </p>
      </div>
      <BillingPage
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        subscription={subscription}
        upcomingInvoice={upcomingInvoice}
        hasDataplaneAddon={hasDataplaneAddon}
      />
    </div>
  );
}
