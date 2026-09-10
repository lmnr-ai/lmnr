"use client";

import { useEffect } from "react";

import { track } from "@/lib/posthog";
import { parseNotificationAttribution } from "@/lib/posthog/notification-attribution";

export default function NotificationAttributionTracker() {
  useEffect(() => {
    const attribution = parseNotificationAttribution(window.location.search);
    if (!attribution) return;

    track("notifications", "email_link_opened", {
      ...attribution,
      destination_path: window.location.pathname,
    });
  }, []);

  return null;
}
