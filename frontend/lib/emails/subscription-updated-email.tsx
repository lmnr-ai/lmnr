import { Button, Html, Preview, Text } from "@react-email/components";

interface SubscriptionUpdatedEmailProps {
  total: string;
  date: string;
  billedTo: string;
  billingPortalUrl: string;
}

export default function SubscriptionUpdatedEmail({
  total,
  date,
  billedTo,
  billingPortalUrl,
}: SubscriptionUpdatedEmailProps) {
  return (
    <Html lang="en">
      <Preview>Payment received — thanks for using Laminar.</Preview>
      <div style={container}>
        <Text style={heading}>Payment received</Text>
        <Text style={text}>Thanks for your payment. A detailed invoice is available in your billing portal.</Text>
        <Text style={label}>Total</Text>
        <Text style={value}>{total}</Text>
        <Text style={label}>Date</Text>
        <Text style={value}>{date}</Text>
        <Text style={label}>Billed to</Text>
        <Text style={value}>{billedTo}</Text>
        <Button style={button} href={billingPortalUrl}>
          View invoice
        </Button>
        <Text style={footer}>LMNR AI, INC. 2026</Text>
      </div>
    </Html>
  );
}

const text = {
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "15px",
  fontWeight: "400",
  lineHeight: "22px",
};

const container = {
  margin: "0 auto",
  padding: "20px",
  maxWidth: "500px",
};

const heading = {
  ...text,
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "24px",
};

const label = {
  ...text,
  fontWeight: "600",
  marginBottom: "0px",
};

const value = {
  ...text,
  marginTop: "0px",
};

const button = {
  display: "inline-block",
  marginTop: "16px",
  padding: "10px 20px",
  backgroundColor: "#111827",
  color: "#ffffff",
  borderRadius: "6px",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
};

const footer = {
  ...text,
  color: "#6b7280",
  fontSize: "12px",
  marginTop: "24px",
};
