import { Html, Text, Link, Preview } from '@react-email/components';

export default function WelcomeEmail({}: {}) {
  return (
    <Html lang="en">
      <Preview>{`We're thrilled to have you on board and can't wait to see what you'll achieve with our platform!`}</Preview>
      <Text style={text}>Welcome to Laminar!</Text>
      <Text style={text}>
        {`My name is Robert and I am the CEO of Laminar. We're thrilled to have you on board and can't wait to see what you'll achieve with our platform!`}
      </Text>
      <Text style={text}>
        The easiest way to get started with Laminar is to read our
        <Link href="https://docs.lmnr.ai/" target="_blank">
          {' docs'}
        </Link>
        .
      </Text>
      <Text style={text}>
        If you have any questions, feel free to
        <Link href="https://cal.com/robert-lmnr/demo" target="_blank">
          {' book some time '}
        </Link>
        with me.
      </Text>
      <Text style={text}>Best,</Text>
      <Text style={text}>Robert, Co-founder & CEO of Laminar</Text>
    </Html>
  );
}

const text = {
  fontFamily: "'Arial', 'Roboto', 'Helvetica', sans-serif",
  fontSize: '13px',
  fontWeight: '400',
  lineHeight: '19.5px'
};
