import {
  Html,
  Heading,
  Text,
  Link,
  Hr,
  Preview
} from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';

const boldClassName = 'w-full flex justify-start mb-1 mt-6';
const textClassName = 'w-full flex justify-start';

interface SubscriptionUpdatedEmailProps {
  productDescription: string;
  date: string;
  billedTo: string;
  shortDescription?: string;
}

// TODO: Import font through tailwind configs
export default function SubscriptionUpdatedEmail({
  productDescription,
  date,
  billedTo,
  shortDescription
}: SubscriptionUpdatedEmailProps) {
  return (
    <Html lang="en">
      <Preview>{`Payment for ${shortDescription ?? productDescription} is received.`}</Preview>
      <Tailwind>
        <div className="flex flex-col items-center">
          <div className="max-w-100 p-4">
            <Heading style={h1}>Payment details</Heading>
            <Text className="w-full flex justify-start" style={text}>
              The payment has been received.
            </Text>
            <div style={{ ...text, ...boldText }} className={boldClassName}>
              Product
            </div>
            <div className={textClassName} style={text}>
              {productDescription}
            </div>
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
              Read more about the tier limits at
              <Link
                className="ml-1"
                href="https://www.lmnr.ai/pricing"
                target="_blank"
              >
                our pricing page.
              </Link>
            </div>
            <div style={text} className="w-full flex justify-start mt-6">
              Thank you for choosing Laminar.
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
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '20px 0',
  padding: '0'
};

const text = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '16px'
};

const boldText = {
  fontWeight: 'bold'
};

const footer = {
  color: '#898989',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '12px',
  lineHeight: '22px',
  marginTop: '12px',
  marginBottom: '24px'
};
