import { type AlertWithDetails, SEVERITY_LEVEL, type SeverityLevel } from "@/lib/actions/alerts/types";

export const isAlertDisabled = (alert: AlertWithDetails) => alert.metadata?.disabled === true;

// Absent severities mean critical only, as the event pipeline and the edit form read them.
export const alertSeverities = (alert: AlertWithDetails): SeverityLevel[] => {
  if (alert.type !== "SIGNAL_EVENT") return [];
  const stored = alert.metadata?.severities as SeverityLevel[] | undefined;
  return stored && stored.length > 0 ? [...stored].sort((a, b) => b - a) : [SEVERITY_LEVEL.CRITICAL];
};
