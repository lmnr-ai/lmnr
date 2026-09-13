import { EmailAction, EmailDocLink, EmailFooter, EmailParagraph, ReportEmailLayout } from "./report-email-layout";
import { defaultEmailTheme, type EmailTheme } from "./theme";

export default function WorkspaceInviteEmail({
  workspaceName,
  inviteLink,
  theme = defaultEmailTheme,
}: {
  workspaceName: string;
  inviteLink: string;
  theme?: EmailTheme;
}) {
  return (
    <ReportEmailLayout
      preview={`You've been invited to join ${workspaceName} on Laminar`}
      workspace={workspaceName}
      title={`Join ${workspaceName} on Laminar 🎉`}
      theme={theme}
    >
      <EmailParagraph first theme={theme}>
        You&apos;ve been invited to collaborate on {workspaceName} workspace.
      </EmailParagraph>
      <EmailParagraph theme={theme}>
        With Laminar you can trace, evaluate, label, and analyze LLM applications together with your team.
      </EmailParagraph>
      <EmailParagraph theme={theme}>This invitation will expire in 7 days.</EmailParagraph>
      <EmailAction href={inviteLink} align="left">
        Accept invitation
      </EmailAction>
      <EmailParagraph theme={theme}>
        If you have any questions, check out our <EmailDocLink href="https://docs.lmnr.ai">documentation</EmailDocLink>{" "}
        or reach out to our team.
      </EmailParagraph>
      <EmailFooter theme={theme}>The Laminar Team</EmailFooter>
    </ReportEmailLayout>
  );
}
