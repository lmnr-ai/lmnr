import { Button, Html, Preview, Text } from "@react-email/components";

interface PaymentFailedEmailProps {
  total: string;
  date: string;
  billedTo: string;
  billingPortalUrl: string;
}

export default function PaymentFailedEmail({ total, date, billedTo, billingPortalUrl }: PaymentFailedEmailProps) {
  return (
    <Html lang="en">
      <Preview>Payment failed — action required.</Preview>
      <div style={container}>
        <Text style={heading}>Payment failed</Text>
        <Text style={text}>
          We were unable to process your payment. Please update your payment method or verify your details in your
          billing portal.
        </Text>
        <Text style={label}>Amount due</Text>
        <Text style={value}>{total}</Text>
        <Text style={label}>Date</Text>
        <Text style={value}>{date}</Text>
        <Text style={label}>Billed to</Text>
        <Text style={value}>{billedTo}</Text>
        <Button style={button} href={billingPortalUrl}>
          Update payment
        </Button>
        <Text style={text}>If you have any questions or need assistance, please don{"'"}t hesitate to reach out.</Text>
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
