import {
  ALERT_TARGET_TYPE,
  ALERT_TYPE,
  type AlertWithDetails,
  SEVERITY_LEVEL,
  type SignalEventAlertMetadata,
} from "@/lib/actions/alerts/types";
import { type Signal, type SignalRow } from "@/lib/actions/signals";

import { type AlertFilterFormItem } from "../alert-filters-section";
import { type SlackChannelSelection } from "../slack-channel-picker";
import { type AlertFormValues, DEFAULT_VALUES } from "./types";

// Initial form values, computed synchronously from already-loaded data.
export function buildDefaultValues({
  alert,
  fixedSignalId,
  signals,
  boundSignal,
  existingFilters,
  userEmail,
}: {
  alert?: AlertWithDetails | null;
  fixedSignalId?: string;
  signals: SignalRow[];
  boundSignal?: Signal;
  existingFilters?: { items: AlertFilterFormItem[] };
  userEmail: string;
}): AlertFormValues {
  if (!alert) {
    const fixedSignal = fixedSignalId ? (signals.find((s) => s.id === fixedSignalId) ?? boundSignal) : undefined;
    return { ...DEFAULT_VALUES, signalName: fixedSignal?.name ?? "" };
  }

  const signal = signals.find((s) => s.id === alert.sourceId) ?? boundSignal;
  const slackTargets = alert.targets.filter((t) => t.type === ALERT_TARGET_TYPE.SLACK);
  const emailTarget = alert.targets.find((t) => t.type === ALERT_TARGET_TYPE.EMAIL && t.email === userEmail);
  const signalEventMeta = alert.type === ALERT_TYPE.SIGNAL_EVENT ? (alert.metadata as SignalEventAlertMetadata) : null;

  const restoredSlackChannels: SlackChannelSelection[] = slackTargets
    .filter((t) => t.channelId && t.channelName)
    .map((t) => ({ id: t.channelId!, name: t.channelName! }));

  return {
    type: alert.type,
    name: alert.name,
    signalName: signal?.name ?? "",
    slackChannels: restoredSlackChannels,
    emailEnabled: !!emailTarget,
    severities:
      signalEventMeta?.severities && signalEventMeta.severities.length > 0
        ? signalEventMeta.severities
        : [SEVERITY_LEVEL.CRITICAL],
    skipSimilar: signalEventMeta?.skipSimilar ?? false,
    alertFilters: existingFilters?.items ?? [],
  };
}
