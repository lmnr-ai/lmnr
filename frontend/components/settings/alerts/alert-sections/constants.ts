import { Box, Zap } from "lucide-react";

import { ALERT_TYPE, type AlertType } from "@/lib/actions/alerts/types";

export const SECTION_ORDER: AlertType[] = [ALERT_TYPE.SIGNAL_EVENT, ALERT_TYPE.NEW_CLUSTER];

export const SECTION_META: Record<AlertType, { title: string; empty: string; icon: typeof Zap }> = {
  [ALERT_TYPE.SIGNAL_EVENT]: {
    title: "New event alerts",
    empty: "Get notified each time a signal detects an event, filtered by severity.",
    icon: Zap,
  },
  [ALERT_TYPE.NEW_CLUSTER]: {
    title: "New cluster alerts",
    empty: "Get notified when similar events group into a new cluster, a sign of a new failure pattern.",
    icon: Box,
  },
};

/** Rows shown before a section collapses the rest behind "Show more". */
export const COLLAPSED_ROWS = 6;
