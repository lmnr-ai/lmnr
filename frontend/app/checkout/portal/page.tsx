import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { getPaymentMethodPortalUrl } from "@/lib/actions/checkout";
import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Billing portal - Laminar",
  description: "Redirecting to your Stripe billing portal.",
};

// Guard against path-traversal-style values flowing into the billing settings
// fallback in the catch branch.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutPortalPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const workspaceId = typeof searchParams?.workspaceId === "string" ? searchParams.workspaceId : undefined;

  if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
    redirect("/projects");
  }

  const session = await getServerSession();
  if (!session) {
    const callback = `/checkout/portal?workspaceId=${encodeURIComponent(workspaceId)}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const workspaceBillingUrl = await getWorkspaceSettingsPath(workspaceId, "billing");

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
