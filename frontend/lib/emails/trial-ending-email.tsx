import { EmailAction, EmailParagraph, EmailRows, ReportEmailLayout } from "./report-email-layout";
import { defaultEmailTheme, type EmailTheme } from "./theme";

interface TrialEndingEmailProps {
  workspaceName: string;
  endsOn: string;
  // With a card on file the trial converts on its own, so the email is a heads-up, not a call to act.
  hasPaymentMethod: boolean;
  addPaymentUrl: string;
  theme?: EmailTheme;
}

export default function TrialEndingEmail({
  workspaceName,
  endsOn,
  hasPaymentMethod,
  addPaymentUrl,
  theme = defaultEmailTheme,
}: TrialEndingEmailProps) {
  if (hasPaymentMethod) {
    return (
      <ReportEmailLayout
        preview={`Your Starter plan starts on ${endsOn}.`}
        workspace={workspaceName}
        title={`Your Starter plan starts on ${endsOn}`}
        theme={theme}
      >
        <EmailParagraph first theme={theme}>
          Your 14-day Starter trial for {workspaceName} ends on {endsOn}. Your card on file will be charged for the
          first month then, and nothing changes in your workspace.
        </EmailParagraph>
      </ReportEmailLayout>
    );
  }

  return (
    <ReportEmailLayout
      preview={`Your Starter trial ends on ${endsOn}.`}
      workspace={workspaceName}
      title={`Your Starter trial ends on ${endsOn}`}
      theme={theme}
    >
      <EmailParagraph first theme={theme}>
        Your 14-day Starter trial for {workspaceName} ends on {endsOn}. Add a payment method to keep Starter. Otherwise
        the workspace moves to the Free plan.
      </EmailParagraph>
      <EmailRows
        rows={[
          ["Data retention", "30 days → 7 days"],
          ["Included data", "3 GB → 1 GB"],
          ["Signals and Slack alerts", "Not included"],
          ["Teammates", "Only owners keep access"],
        ]}
        theme={theme}
      />
      <EmailAction href={addPaymentUrl}>Add payment method</EmailAction>
    </ReportEmailLayout>
  );
}
