import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TIER_CONFIG } from "@/lib/actions/checkout/types";

import PricingCard from "../landing/pricing/pricing-card";

const TIER_LINKS = {
  hobby: `/checkout?lookupKey=${TIER_CONFIG.hobby.lookupKey}`,
  pro: `/checkout?lookupKey=${TIER_CONFIG.pro.lookupKey}`,
};

interface PricingDialogProps {
  workspaceTier: string;
  workspaceId: string;
  workspaceName: string;
}

const isTierPaid = (tier: string) => tier.toLowerCase().trim() !== "free";

export default function PricingDialog({ workspaceTier, workspaceId, workspaceName }: PricingDialogProps) {
  const addWorkspaceToLink = (link: string) =>
    `${link}&workspaceId=${workspaceId}&workspaceName=${encodeURIComponent(workspaceName)}`;
  const billingLink = `/checkout/portal?workspaceId=${workspaceId}&workspaceName=${encodeURIComponent(workspaceName)}`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <div className="p-8 border flex flex-col justify-between">
        <PricingCard
          className="text-secondary-foreground"
          title="Free"
          price="0 / month"
          features={["1GB data / month", "15 day data retention", "1 team member", "Community support"]}
        />
        {workspaceTier === "free" && (
          <div className="mt-4">
            <Button variant="secondary" className="w-full h-10" disabled>
              Current plan
            </Button>
          </div>
        )}
      </div>

      <div className="p-8 border flex flex-col justify-between">
        <PricingCard
          className="text-secondary-foreground"
          title="Hobby"
          price="$25 / month"
          features={[
            "3GB data / month included",
            "1,000 signal runs / month",
            "30 day data retention",
            "Priority email support",
          ]}
          subfeatures={["then $2 per 1GB of additional data", "then $2 per 100 signal runs", null, null]}
        />
        <div className="mt-4">
          <Link href={isTierPaid(workspaceTier) ? billingLink : addWorkspaceToLink(TIER_LINKS.hobby)}>
            <Button variant="secondary" className="w-full h-10">
              {workspaceTier === "hobby"
                ? "Manage billing"
                : isTierPaid(workspaceTier)
                  ? "Manage billing"
                  : "Upgrade to Hobby"}
            </Button>
          </Link>
        </div>
      </div>

      <div className="h-full w-full p-8 flex flex-col justify-between z-20 border border-primary bg-primary">
        <PricingCard
          className="text-white z-20"
          title="Pro"
          price="$150 / month"
          features={[
            "10GB data / month included",
            "10,000 signal runs / month",
            "90 day data retention",
            "Private Slack channel",
          ]}
          subfeatures={["then $1.50 per 1GB of additional data", "then $1.50 per 100 signal runs", null, null]}
        />
        <div className="mt-4 z-20">
          <Link
            href={isTierPaid(workspaceTier) ? billingLink : addWorkspaceToLink(TIER_LINKS.pro)}
            className="w-full z-20"
          >
            <Button
              className="h-10 text-base bg-white/90 border-none text-primary hover:bg-white/70 w-full"
              variant="outline"
            >
              {isTierPaid(workspaceTier) ? "Manage billing" : "Upgrade to Pro"}
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-8 border flex flex-col justify-between">
        <PricingCard
          className="text-secondary-foreground"
          title="Enterprise"
          price="Custom"
          features={["Custom data retention", "Custom team members", "On-premise deployment", "Dedicated support"]}
        />
        <div className="mt-4">
          <Link href="mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry">
            <Button variant="secondary" className="w-full h-10">
              Contact us
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
