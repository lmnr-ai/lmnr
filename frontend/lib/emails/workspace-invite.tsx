import { Html, Link, Preview, Text } from "@react-email/components";

import { buildEmailStyles, defaultEmailTheme, type EmailTheme } from "./theme";

export default function WorkspaceInviteEmail({
  workspaceName,
  inviteLink,
  theme = defaultEmailTheme,
}: {
  workspaceName: string;
  inviteLink: string;
  theme?: EmailTheme;
}) {
  const s = buildEmailStyles(theme);

  return (
    <Html lang="en">
      <Preview>
        You{"'"}ve been invited to join {workspaceName} on Laminar
      </Preview>
      <div style={s.container}>
        <Text style={s.heading}>Join {workspaceName} on Laminar! 🎉</Text>
        <Text style={s.text}>
          You{"'"}ve been invited to collaborate on {workspaceName} workspace.
        </Text>
        <Text style={s.text}>
          With Laminar you can trace, evaluate, label, and analyze LLM applications together with your team.
        </Text>
        <Text style={s.text}>This invitation will expire in 7 days.</Text>
        <Link
          href={inviteLink}
          target="_blank"
          style={{
            ...s.button,
            backgroundColor: theme.accent,
            color: theme.buttonForeground,
            marginBottom: `${theme.blockSpacing}px`,
          }}
        >
          Accept Invitation
        </Link>
        <Text style={s.text}>
          If you have any questions, check out our
          <Link style={s.link} href="https://docs.lmnr.ai" target="_blank">
            {" documentation"}
          </Link>
          {" or reach out to our team."}
        </Text>
        <Text style={s.signature}>The Laminar Team</Text>
      </div>
    </Html>
  );
}
