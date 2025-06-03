import Link from "next/link";

import { Button } from "@/components/ui/button";

import PricingCard from "../landing/pricing-card";

const TIER_LINKS = {
  hobby: "/checkout?type=workspace&lookupKey=hobby_monthly_2025_04",
  pro: "/checkout?type=workspace&lookupKey=pro_monthly_2025_04",
};

interface PricingDialogProps {
  workspaceTier: string;
  workspaceId: string;
  workspaceName: string;
}

const isTierPaid = (tier: string) => tier.toLowerCase().trim() !== "free";

export default function PricingDialog({ workspaceTier, workspaceId, workspaceName }: PricingDialogProps) {
  const addWorkspaceToLink = (link: string) => `${link}&workspaceId=${workspaceId}&workspaceName=${workspaceName}`;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-8 border flex flex-col justify-between">
          <PricingCard
            className="text-secondary-foreground"
            title="Free"
            price="0 / month"
            features={[
              "1GB data / month",
              "15 day data retention",
              "1 team member",
              "500 Index agent steps / month",
              "Community support",
            ]}
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
              "2GB data / month included",
              "30 day data retention",
              "2 team members",
              "2500 Index agent steps / month",
              "Priority email support",
            ]}
            subfeatures={[
              "then $2 per 1GB of additional data",
              null,
              null,
              "then $10 per 1k steps",
              null,
            ]}
          />
          <div className="mt-4">
            <Link href={workspaceTier === "hobby" ? "/checkout/portal" : addWorkspaceToLink(TIER_LINKS.hobby)}>
              <Button variant="secondary" className="w-full h-10">
                {workspaceTier === "hobby" ? "Manage billing" : "Upgrade to Hobby"}
              </Button>
            </Link>
          </div>
        </div>

        <div className="h-full w-full p-8 flex flex-col justify-between z-20 border border-primary bg-primary">
          <PricingCard
            className="text-white z-20"
            title="Pro"
            price="$50 / month"
            features={[
              "5GB data / month included",
              "90 day data retention",
              "5 team members included",
              "5000 Index agent steps / month",
              "Private Slack channel",
            ]}
            subfeatures={[
              "then $2 per 1GB of additional data",
              null,
              "then $25 per additional team member",
              "then $10 per 1k steps",
              null,
            ]}
          />
          <div className="mt-4 z-20">
            <Link
              href={isTierPaid(workspaceTier) ? "/checkout/portal" : addWorkspaceToLink(TIER_LINKS.pro)}
              className="w-full z-20"
            >
              <Button
                className="h-10 text-base bg-white/90 border-none text-primary hover:bg-white/70 w-full"
                variant="outline"
              >
                {isTierPaid(workspaceTier)
                  ? workspaceTier === "pro"
                    ? "Manage billing"
                    : workspaceTier === "hobby"
                      ? "Upgrade to Pro"
                      : "Upgrade to Pro"
                  : "Upgrade to Pro"}
              </Button>
            </Link>
          </div>
        </div>

        <div className="p-8 border flex flex-col justify-between">
          <PricingCard
            className="text-secondary-foreground"
            title="Enterprise"
            price="Custom"
            features={[
              "Custom data retention",
              "Custom team members",
              "Custom agent steps",
              "On-premise deployment",
              "Dedicated support",
            ]}
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
    </div>
  );
}
