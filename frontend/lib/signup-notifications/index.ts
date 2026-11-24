import { orgDomainFromEmail } from "@/lib/email-domain";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const SLACK_REQUEST_TIMEOUT_MS = 5_000;

interface SignupNotificationArgs {
  email: string;
  name?: string | null;
}

// Escaping `<`, `>` and `&` keeps a user-chosen name from rendering as a link or `<!channel>` ping.
const escapeSlackText = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Null for consumer (gmail, outlook, …), academic and malformed emails: only company sign-ups are posted.
export const buildSignupSlackMessage = ({ email, name }: SignupNotificationArgs): { text: string } | null => {
  const domain = orgDomainFromEmail(email);
  if (!domain) {
    return null;
  }

  const lines = [`:tada: New sign-up from <https://${domain}|${domain}>`];
  const trimmedName = name?.trim();
  if (trimmedName) {
    lines.push(`*Name:* ${escapeSlackText(trimmedName)}`);
  }
  lines.push(`*Email:* ${escapeSlackText(email)}`);

  return { text: lines.join("\n") };
};

export const notifySignupInSlack = async (args: SignupNotificationArgs): Promise<void> => {
  if (!isFeatureEnabled(Feature.SIGNUP_SLACK_NOTIFICATIONS)) {
    return;
  }

  const message = buildSignupSlackMessage(args);
  if (!message) {
    return;
  }

  try {
    const response = await fetch(process.env.SIGNUP_SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      // Bound the wait so a slow Slack API can't stall sign-up.
      signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`Failed to post sign-up to Slack (${response.status}): ${body}`);
    }
  } catch (error) {
    // Notification failures must never break sign-up.
    console.warn("Failed to post sign-up to Slack", error);
  }
};
