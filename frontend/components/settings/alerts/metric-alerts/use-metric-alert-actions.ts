import { useCallback, useState } from "react";

import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

type Patch = { action: "toggleDisabled"; disabled: boolean } | { action: "snooze"; until: string | null };

/** Mute and snooze for a saved rule. `onChanged` runs after the change is stored. */
export const useMetricAlertActions = (projectId: string, onChanged: () => void) => {
  const { toast } = useToast();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const patch = useCallback(
    async (alert: Pick<MetricAlert, "id">, body: Patch, done: string) => {
      setPendingIds((prev) => new Set(prev).add(alert.id));
      const { error } = await fetchApi(`/api/projects/${projectId}/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(alert.id);
        return next;
      });
      if (error !== null) {
        toast({ variant: "destructive", title: error });
        return;
      }
      toast({ title: done, duration: 1500 });
      onChanged();
    },
    [projectId, onChanged, toast]
  );

  const setMuted = useCallback(
    (alert: Pick<MetricAlert, "id">, disabled: boolean) =>
      patch(alert, { action: "toggleDisabled", disabled }, disabled ? "Alert muted" : "Alert unmuted"),
    [patch]
  );

  const snooze = useCallback(
    (alert: Pick<MetricAlert, "id">, until: Date | null) =>
      patch(alert, { action: "snooze", until: until?.toISOString() ?? null }, until ? "Alert snoozed" : "Snooze ended"),
    [patch]
  );

  return { pendingIds, setMuted, snooze };
};
