import { EmailAction, EmailParagraph, ReportEmailLayout } from "./report-email-layout";
import { defaultEmailTheme, type EmailTheme } from "./theme";

interface TrialEndedEmailProps {
  workspaceName: string;
  upgradeUrl: string;
  theme?: EmailTheme;
}

export default function TrialEndedEmail({
  workspaceName,
  upgradeUrl,
  theme = defaultEmailTheme,
}: TrialEndedEmailProps) {
  return (
    <ReportEmailLayout
      preview="Your Starter trial has ended."
      workspace={workspaceName}
      title="Your Starter trial has ended"
      theme={theme}
    >
      <EmailParagraph first theme={theme}>
        {workspaceName} is now on the Free plan. Teammates can't open the workspace until an owner upgrades.
      </EmailParagraph>
      <EmailParagraph theme={theme}>
        Upgrade any time to bring back Starter limits and access for your team.
      </EmailParagraph>
      <EmailAction href={upgradeUrl}>Upgrade</EmailAction>
    </ReportEmailLayout>
  );
}
