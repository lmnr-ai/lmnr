export const ALERT_TYPE = {
  SIGNAL_EVENT: "SIGNAL_EVENT",
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

export const ALERT_TARGET_TYPE = {
  SLACK: "SLACK",
  EMAIL: "EMAIL",
} as const;

export const SEVERITY_LEVELS = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
} as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS];

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  [SEVERITY_LEVELS.INFO]: "Info",
  [SEVERITY_LEVELS.WARNING]: "Warning",
  [SEVERITY_LEVELS.CRITICAL]: "Critical",
};

export interface SignalEventAlertMetadata {
  severity: SeverityLevel;
}

export interface AlertTarget {
  id: string;
  type: string;
  integrationId: string | null;
  channelId: string | null;
  channelName: string | null;
  email: string | null;
}

export interface AlertWithDetails {
  id: string;
  name: string;
  type: AlertType;
  sourceId: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  targets: AlertTarget[];
  metadata: SignalEventAlertMetadata | null;
}
