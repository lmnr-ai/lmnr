import { ALERT_TYPE, type AlertType, SEVERITY_LEVEL, type SeverityLevel } from "@/lib/actions/alerts/types";

import { type AlertFilterFormItem } from "../alert-filters-section";
import { type SlackChannelSelection } from "../slack-channel-picker";

export interface AlertFormValues {
  type: AlertType | "";
  name: string;
  signalName: string;
  slackChannels: SlackChannelSelection[];
  emailEnabled: boolean;
  severities: SeverityLevel[];
  skipSimilar: boolean;
  alertFilters: AlertFilterFormItem[];
}

export const CHART_FIELDS = ["count"] as const;

export const SEVERITY_OPTIONS = [SEVERITY_LEVEL.INFO, SEVERITY_LEVEL.WARNING, SEVERITY_LEVEL.CRITICAL] as const;

export const DEFAULT_VALUES: AlertFormValues = {
  type: ALERT_TYPE.SIGNAL_EVENT,
  name: "",
  signalName: "",
  slackChannels: [],
  emailEnabled: false,
  severities: [SEVERITY_LEVEL.CRITICAL],
  skipSimilar: true,
  alertFilters: [],
};

export const ALERT_TYPE_DESCRIPTIONS: Record<AlertType, string> = {
  [ALERT_TYPE.SIGNAL_EVENT]: "Notify when a new signal event is detected.",
  [ALERT_TYPE.NEW_CLUSTER]: "Notify when a new cluster is created.",
};
