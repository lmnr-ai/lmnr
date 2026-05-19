import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { getPaymentMethodPortalUrl } from "@/lib/actions/checkout";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Billing portal - Laminar",
  description: "Redirecting to your Stripe billing portal.",
};

export default async function CheckoutPortalPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const workspaceId = typeof searchParams?.workspaceId === "string" ? searchParams.workspaceId : undefined;

  if (!workspaceId) {
    redirect("/projects");
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    const callback = `/checkout/portal?workspaceId=${encodeURIComponent(workspaceId)}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const workspaceBillingUrl = `/workspace/${workspaceId}?tab=billing`;

  let portalUrl: string;
  try {
    portalUrl = await getPaymentMethodPortalUrl({
      workspaceId,
      returnUrl: `${process.env.NEXT_PUBLIC_URL ?? "https://lmnr.ai"}${workspaceBillingUrl}`,
    });
  } catch (e) {
    console.error("Failed to open billing portal from email link", e);
    redirect(workspaceBillingUrl);
  }

  redirect(portalUrl);
}
