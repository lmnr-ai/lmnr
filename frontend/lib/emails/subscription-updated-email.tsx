import { Html, Link, Preview, Text } from "@react-email/components";

import { type ItemDescription } from "@/lib/actions/checkout/types";

interface SubscriptionUpdatedEmailProps {
  itemDescriptions: ItemDescription[];
  date: string;
  billedTo: string;
}

const renderPreviewString = (itemDescriptions: ItemDescription[]) => {
  if (itemDescriptions.length === 1) {
    const { productDescription, shortDescription } = itemDescriptions[0];
    return `Payment for ${shortDescription ?? productDescription} is received.`;
  }
  return "Thanks for your payment!";
};

export default function SubscriptionUpdatedEmail({ itemDescriptions, date, billedTo }: SubscriptionUpdatedEmailProps) {
  return (
    <Html lang="en">
      <Preview>{renderPreviewString(itemDescriptions)}</Preview>
      <div style={container}>
        <Text style={heading}>Payment details</Text>
        <Text style={text}>The payment has been received.</Text>
        <Text style={label}>Products</Text>
        {itemDescriptions.map(({ productDescription }, index) => (
          <Text style={value} key={index}>
            {productDescription}
          </Text>
        ))}
        <Text style={label}>Date</Text>
        <Text style={value}>{date}</Text>
        <Text style={label}>Billed to</Text>
        <Text style={value}>{billedTo}</Text>
        <Text style={text}>
          Read more about the tier limits at
          <Link style={link} href="https://www.laminar.sh/pricing" target="_blank">
            {" our pricing page"}
          </Link>
          .
        </Text>
        <Text style={text}>Thank you for choosing Laminar.</Text>
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

const link = {
  color: "#2563eb",
  textDecoration: "none",
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

const footer = {
  ...text,
  color: "#6b7280",
  fontSize: "12px",
  marginTop: "24px",
};
