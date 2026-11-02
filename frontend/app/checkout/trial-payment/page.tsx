import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { getTrialPaymentUrl } from "@/lib/actions/checkout/trial";
import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Add payment method - Laminar",
  description: "Redirecting to Stripe to add a payment method.",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Trial email CTA: opens Stripe setup Checkout while the trial runs; otherwise (trial over,
// or not an owner/admin) falls back to the workspace billing tab.
export default async function TrialPaymentPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const workspaceId = typeof searchParams?.workspaceId === "string" ? searchParams.workspaceId : undefined;

  if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
    redirect("/projects");
  }

  const session = await getServerSession();
  if (!session) {
    const callback = `/checkout/trial-payment?workspaceId=${encodeURIComponent(workspaceId)}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const workspaceBillingUrl = await getWorkspaceSettingsPath(workspaceId, "billing");

  let checkoutUrl: string;
  try {
    checkoutUrl = await getTrialPaymentUrl({
      workspaceId,
      returnUrl: `${process.env.NEXT_PUBLIC_URL ?? "https://lmnr.ai"}${workspaceBillingUrl}`,
    });
  } catch {
    redirect(workspaceBillingUrl);
  }

  redirect(checkoutUrl);
}
