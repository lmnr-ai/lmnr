import { Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

import { type ItemDescription } from "@/lib/actions/checkout/types";

const boldClassName = "w-full flex justify-start mb-1 mt-6";
const textClassName = "w-full flex justify-start";

interface PaymentFailedEmailProps {
  itemDescriptions: ItemDescription[];
  date: string;
  billedTo: string;
}

const renderPreviewString = (itemDescriptions: ItemDescription[]) => {
  if (itemDescriptions.length === 1) {
    const { productDescription, shortDescription } = itemDescriptions[0];
    return `Payment for ${shortDescription ?? productDescription} failed.`;
  }
  return "Payment failed - action required";
};

// TODO: Import font through tailwind configs
export default function PaymentFailedEmail({ itemDescriptions, date, billedTo }: PaymentFailedEmailProps) {
  return (
    <Html lang="en">
      <Preview>{renderPreviewString(itemDescriptions)}</Preview>
      <Tailwind>
        <div className="flex flex-col items-center">
          <div className="max-w-100 p-4">
            <Heading style={h1}>Payment failed</Heading>
            <Text className="w-full flex justify-start" style={text}>
              We were unable to process your payment. Please update your payment or verify payment details.
            </Text>
            <div style={{ ...text, ...boldText }} className={boldClassName}>
              Products
            </div>
            {itemDescriptions.map(({ productDescription, quantity }, index) => (
              <div className={textClassName} style={text} key={index}>
                {/* quantity is already included in the long description */}
                {productDescription}
              </div>
            ))}
            <div style={{ ...text, ...boldText }} className={boldClassName}>
              Date
            </div>
            <div className={textClassName} style={text}>
              {date}
            </div>
            <div style={{ ...text, ...boldText }} className={boldClassName}>
              Billed to
            </div>
            <div className={textClassName} style={text}>
              {billedTo}
            </div>
            <div style={text} className="mt-6">
              Please update your payment method in your
              <Link className="ml-1" href="https://www.lmnr.ai/settings/billing" target="_blank">
                billing settings
              </Link>
              .
            </div>
            <div style={text} className="w-full flex justify-start mt-6">
              If you have any questions or need assistance, please don't hesitate to reach out to us.
            </div>
            <Hr />
            <Text style={footer}>LMNR AI, INC. 2024</Text>
          </div>
        </div>
      </Tailwind>
    </Html>
  );
}

const h1 = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "32px",
  fontWeight: "bold",
  margin: "20px 0",
  padding: "0",
};

const text = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "16px",
};

const boldText = {
  fontWeight: "bold",
};

const footer = {
  color: "#898989",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "12px",
  lineHeight: "22px",
  marginTop: "12px",
  marginBottom: "24px",
};
