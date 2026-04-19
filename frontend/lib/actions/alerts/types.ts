export const ALERT_TYPE = {
  SIGNAL_EVENT: "SIGNAL_EVENT",
  NEW_CLUSTER: "NEW_CLUSTER",
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  [ALERT_TYPE.SIGNAL_EVENT]: "New event",
  [ALERT_TYPE.NEW_CLUSTER]: "New cluster",
};

export const ALERT_TARGET_TYPE = {
  SLACK: "SLACK",
  EMAIL: "EMAIL",
} as const;

export const SEVERITY_LEVEL = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
} as const;

export type SeverityLevel = (typeof SEVERITY_LEVEL)[keyof typeof SEVERITY_LEVEL];

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  [SEVERITY_LEVEL.INFO]: "Info",
  [SEVERITY_LEVEL.WARNING]: "Warning",
  [SEVERITY_LEVEL.CRITICAL]: "Critical",
};

export interface SignalEventAlertMetadata {
  severity?: SeverityLevel;
  skipSimilar?: boolean;
}

// NEW_CLUSTER alerts have no metadata fields today.
export type NewClusterAlertMetadata = Record<string, never>;

export type AlertMetadata = SignalEventAlertMetadata | NewClusterAlertMetadata;

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
  signalName: string | null;
  projectId: string;
  projectName: string;
  createdAt: string;
  targets: AlertTarget[];
  metadata: AlertMetadata;
}
