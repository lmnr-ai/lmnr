import { EmailAction, EmailParagraph, EmailRows, ReportEmailLayout } from "./report-email-layout";
import { defaultEmailTheme, type EmailTheme } from "./theme";

interface SubscriptionUpdatedEmailProps {
  total: string;
  date: string;
  billedTo: string;
  billingPortalUrl: string;
  theme?: EmailTheme;
}

export default function SubscriptionUpdatedEmail({
  total,
  date,
  billedTo,
  billingPortalUrl,
  theme = defaultEmailTheme,
}: SubscriptionUpdatedEmailProps) {
  return (
    <ReportEmailLayout
      preview="Payment received — thanks for using Laminar."
      workspace="Laminar"
      title="Payment received"
      theme={theme}
    >
      <EmailParagraph first theme={theme}>
        Thanks for your payment.
      </EmailParagraph>
      <EmailRows
        rows={[
          ["Total", total],
          ["Date", date],
          ["Billed to", billedTo],
          ["Status", "Paid"],
        ]}
        theme={theme}
      />
      <EmailParagraph theme={theme}>You can view and download invoices in your Stripe billing portal.</EmailParagraph>
      <EmailAction href={billingPortalUrl}>View billing portal</EmailAction>
    </ReportEmailLayout>
  );
}
