import { type AlertWithDetails, type SeverityLevel } from "@/lib/actions/alerts/types";

export const isAlertDisabled = (alert: AlertWithDetails) => alert.metadata?.disabled === true;

export const alertSeverities = (alert: AlertWithDetails): SeverityLevel[] =>
  alert.type === "SIGNAL_EVENT"
    ? [...((alert.metadata?.severities as SeverityLevel[] | undefined) ?? [])].sort((a, b) => b - a)
    : [];
