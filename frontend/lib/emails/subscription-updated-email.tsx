import { Button, Html, Preview, Text } from "@react-email/components";

import { buildEmailStyles, defaultEmailTheme, type EmailTheme } from "./theme";

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
  const s = buildEmailStyles(theme);

  return (
    <Html lang="en">
      <Preview>Payment received — thanks for using Laminar.</Preview>
      <div style={s.container}>
        <Text style={s.heading}>Payment received</Text>
        <Text style={s.text}>Thanks for your payment.</Text>
        <Text style={s.label}>Total</Text>
        <Text style={s.value}>{total}</Text>
        <Text style={s.label}>Date</Text>
        <Text style={s.value}>{date}</Text>
        <Text style={s.label}>Billed to</Text>
        <Text style={s.value}>{billedTo}</Text>
        <Text style={s.text}>You can view and download invoices in your Stripe billing portal.</Text>
        <Button style={s.button} href={billingPortalUrl}>
          View billing portal
        </Button>
        <Text style={{ ...s.muted, marginTop: `${theme.blockSpacing}px` }}>LMNR AI, INC. 2026</Text>
      </div>
    </Html>
  );
}
