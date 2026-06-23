"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { useNotificationPanelStore } from "@/components/notifications/notification-store";

// The panel and its notification SWR fetch are code-split out of the project layout
// bundle and only loaded/mounted after the panel is first opened, so the always-mounted
// layout doesn't fire the notifications query on every page load.
const Panel = dynamic(() => import("./panel.tsx").then((mod) => mod.NotificationPanel), { ssr: false });

const NotificationPanel = () => {
  const isOpen = useNotificationPanelStore((state) => state.isOpen);
  const [hasOpened, setHasOpened] = useState(false);

  // Latch on first open and stay mounted thereafter so the panel's own close
  // (exit) animation still plays — we only defer the initial mount/fetch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  if (!hasOpened) return null;

  return <Panel />;
};

export default NotificationPanel;
