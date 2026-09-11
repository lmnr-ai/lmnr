import { EmailAction, EmailParagraph, EmailRows, ReportEmailLayout } from "./report-email-layout";
import { defaultEmailTheme, type EmailTheme } from "./theme";

interface PaymentFailedEmailProps {
  total: string;
  date: string;
  billedTo: string;
  billingPortalUrl: string;
  theme?: EmailTheme;
}

export default function PaymentFailedEmail({
  total,
  date,
  billedTo,
  billingPortalUrl,
  theme = defaultEmailTheme,
}: PaymentFailedEmailProps) {
  return (
    <ReportEmailLayout
      preview="Payment failed — action required."
      workspace="Laminar"
      title="Payment failed"
      theme={theme}
    >
      <EmailParagraph first theme={theme}>
        We were unable to process your payment. Please update your payment method or verify your details in your billing
        portal.
      </EmailParagraph>
      <EmailRows
        rows={[
          ["Amount due", total],
          ["Date", date],
          ["Billed to", billedTo],
          ["Status", "Past due"],
        ]}
        theme={theme}
      />
      <EmailAction href={billingPortalUrl}>Update payment</EmailAction>
    </ReportEmailLayout>
  );
}
