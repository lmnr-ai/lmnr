import { Html, Link, Preview, Text } from '@react-email/components';

export default function WelcomeEmail({ }: {}) {
  return (
    <Html lang="en">
      <Preview>Welcome to Laminar - start tracing, evaluating, and analyzing your LLM app in minutes</Preview>
      <div style={container}>
        <Text style={heading}>Welcome to Laminar! 👋</Text>
        <Text style={text}>
          I{"'"}m Robert, CEO of Laminar. Stoked to have you join our community!
        </Text>
        <Text style={text}>
          With Laminar you can trace, evaluate, label, and analyze your LLM application.
          Laminar is fully open source, so don{"'"}t forget to
          <Link style={link} href="https://github.com/lmnr-ai/lmnr" target="_blank">
            {' star ⭐ our repo on GitHub'}
          </Link>
          !
        </Text>
        <Text style={text}>
          To help you get started, our team has put together comprehensive documentation:
        </Text>
        <div style={bulletList}>
          <Text style={bulletPoint}>
            • <Link style={link} href="https://docs.lmnr.ai/tracing" target="_blank">
              Tracing your LLM applications
            </Link>
          </Text>
          <Text style={bulletPoint}>
            • <Link style={link} href="https://docs.lmnr.ai/evaluations" target="_blank">
              Running evaluations
            </Link>
          </Text>
          <Text style={bulletPoint}>
            • <Link style={link} href="https://docs.lmnr.ai/labels" target="_blank">
              Creating and managing labels
            </Link>
          </Text>
          <Text style={bulletPoint}>
            • <Link style={link} href="https://docs.lmnr.ai/datasets" target="_blank">
              Working with datasets
            </Link>
          </Text>
        </div>
        <Text style={text}>
          Got questions or running into issues? I{"'"}m here to help - just
          <Link style={link} href="https://cal.com/robert-lmnr/demo" target="_blank">
            {' grab a slot on my calendar'}
          </Link>
          {' and we can pair on it.'}
        </Text>
        <Text style={text}>Happy coding!</Text>
        <Text style={signature}>Robert</Text>
        <Text style={role}>Co-founder & CEO @ Laminar</Text>
      </div>
    </Html>
  );
}

const text = {
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: '13px',
  fontWeight: '400',
  lineHeight: '19.5px'
};

const container = {
  margin: '0 auto',
  padding: '20px',
  maxWidth: '500px',
};

const heading = {
  ...text,
  fontSize: '24px',
  fontWeight: '600',
  marginBottom: '24px',
};

const link = {
  color: '#2563eb',
  textDecoration: 'none',
};

const signature = {
  ...text,
  marginTop: '24px',
  fontWeight: '500',
};

const role = {
  ...text,
  color: '#6b7280',
  fontSize: '12px',
};

const bulletList = {
  marginLeft: '20px',
  marginBottom: '16px',
};

const bulletPoint = {
  ...text,
  marginBottom: '8px',
};
