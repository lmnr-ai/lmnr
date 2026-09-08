import { Button, Html, Preview, Text } from "@react-email/components";

import { buildEmailStyles, defaultEmailTheme, type EmailTheme } from "./theme";

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
  const s = buildEmailStyles(theme);

  return (
    <Html lang="en">
      <Preview>Payment failed — action required.</Preview>
      <div style={s.container}>
        <Text style={s.heading}>Payment failed</Text>
        <Text style={s.text}>
          We were unable to process your payment. Please update your payment method or verify your details in your
          billing portal.
        </Text>
        <Text style={s.label}>Amount due</Text>
        <Text style={s.value}>{total}</Text>
        <Text style={s.label}>Date</Text>
        <Text style={s.value}>{date}</Text>
        <Text style={s.label}>Billed to</Text>
        <Text style={s.value}>{billedTo}</Text>
        <Button style={s.button} href={billingPortalUrl}>
          Update payment
        </Button>
        <Text style={s.text}>
          If you have any questions or need assistance, please don{"'"}t hesitate to reach out.
        </Text>
        <Text style={{ ...s.muted, marginTop: `${theme.blockSpacing}px` }}>LMNR AI, INC. 2026</Text>
      </div>
    </Html>
  );
}
