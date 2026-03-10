export const ALERT_TYPE = {
  SIGNAL_EVENT: "SIGNAL_EVENT",
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

export interface AlertTarget {
  id: string;
  type: string;
  integrationId: string;
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
}
