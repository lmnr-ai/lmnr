import { Link, Text } from "@react-email/components";

import { TIERS } from "@/lib/billing/tiers";

import TrialEmailLayout, {
  action,
  ChangesList,
  footnote,
  footnoteLink,
  intro,
  paragraph,
  PRICING_URL,
  STARTER_TO_FREE_CHANGES,
} from "./trial-email-layout";

export default function TrialEndedEmail({ workspaceName, upgradeUrl }: { workspaceName: string; upgradeUrl: string }) {
  return (
    <TrialEmailLayout
      workspaceName={workspaceName}
      heading="Your Starter trial has ended"
      preview={`${workspaceName} is now on the Free plan`}
    >
      <Text style={intro}>
        Your Starter trial for {workspaceName} has ended, and the workspace is now on the Free plan.
      </Text>
      <Text style={paragraph}>Here{"'"}s what changed:</Text>
      <ChangesList changes={STARTER_TO_FREE_CHANGES} />
      <Text style={paragraph}>Upgrade to Starter to get these back.</Text>
      <Link style={action} href={upgradeUrl} target="_blank">
        Upgrade to Starter
      </Link>
      <Text style={footnote}>
        <Link href={PRICING_URL} style={footnoteLink} target="_blank">
          Compare plans
        </Link>
        {` · $${TIERS.hobby.basePriceMonthly} a month, cancel anytime`}
      </Text>
    </TrialEmailLayout>
  );
}
