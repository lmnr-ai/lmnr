const NOTIFICATION_MEDIUM = "notification";

export interface NotificationAttribution {
  $utm_source: string;
  $utm_medium: string;
  $utm_campaign: string;
  $utm_content: string;
}

export function parseNotificationAttribution(search: string): NotificationAttribution | null {
  const params = new URLSearchParams(search);
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  const content = params.get("utm_content");

  if (!source || medium !== NOTIFICATION_MEDIUM || !campaign || !content) return null;

  return {
    $utm_source: source,
    $utm_medium: medium,
    $utm_campaign: campaign,
    $utm_content: content,
  };
}
