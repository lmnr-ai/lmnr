import { Html, Link, Preview, Text } from '@react-email/components';

export default function WorkspaceInviteEmail({
  workspaceName,
  inviteLink
}: {
  workspaceName: string;
  inviteLink: string;
}) {
  return (
    <Html lang="en">
      <Preview>You{"'"}ve been invited to join {workspaceName} on Laminar</Preview>
      <div style={container}>
        <Text style={heading}>Join {workspaceName} on Laminar! 🎉</Text>
        <Text style={text}>
          You{"'"}ve been invited to collaborate on {workspaceName} workspace.
        </Text>
        <Text style={text}>
          With Laminar you can trace, evaluate, label, and analyze LLM applications together with your team.
        </Text>
        <Text style={text}>
          This invitation will expire in 48 hours.
        </Text>
        <Link
          href={inviteLink}
          target="_blank"
          style={{
            ...button,
            display: 'inline-block',
            marginTop: '24px',
            marginBottom: '24px',
          }}
        >
          Accept Invitation
        </Link>
        <Text style={text}>
          If you have any questions, check out our
          <Link style={link} href="https://docs.lmnr.ai" target="_blank">
            {' documentation'}
          </Link>
          {' or reach out to our team.'}
        </Text>
        <Text style={signature}>The Laminar Team</Text>
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

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: '500',
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 24px',
};
