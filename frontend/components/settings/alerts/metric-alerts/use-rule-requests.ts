import { useEffect, useState } from "react";
import useSWR from "swr";

import { type MetricRuleInput, type MetricRulePreview, type RuleCadence } from "@/lib/actions/alerts/metric-rule";
import { fetchApi } from "@/lib/api/fetch-api";

const DEBOUNCE_MS = 400;

const useDebounced = <T>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const post = async <T>([url, body]: [string, string]): Promise<T> => {
  const { data, error } = await fetchApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (error !== null) throw new Error(error);
  return data;
};

const SWR_OPTIONS = { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false };

interface Options {
  /** Hours of history to replay. */
  hours: number;
  /** A saved rule, so its cached baselines can be reused. */
  alertId?: string;
  /** Wait for typing to settle before asking again. */
  debounce?: boolean;
  /** Ask again this often, for a chart that stays open. */
  refreshMs?: number;
}

/**
 * Replays a rule over stored data. The error is the app-server's own message,
 * so the form shows the same sentence a save would be refused with.
 */
export const useRulePreview = (projectId: string, rule: MetricRuleInput | null, options: Options) => {
  const body = rule ? JSON.stringify({ rule, hours: options.hours, alertId: options.alertId }) : null;
  const settled = useDebounced(body, options.debounce ? DEBOUNCE_MS : 0);
  const key = settled ? [`/api/projects/${projectId}/alerts/metric/preview`, settled] : null;

  const { data, error, isLoading } = useSWR<MetricRulePreview, Error>(key, post<MetricRulePreview>, {
    ...SWR_OPTIONS,
    refreshInterval: options.refreshMs,
  });

  return {
    preview: error ? undefined : data,
    error: error?.message,
    isLoading: isLoading || body !== settled,
  };
};

/** Asks whether a rule can be saved, and how often it would be checked. Touches no stored data. */
export const useRuleCheck = (projectId: string, rule: MetricRuleInput, enabled = true) => {
  const body = JSON.stringify({ rule });
  const settled = useDebounced(body, DEBOUNCE_MS);
  const key = enabled ? [`/api/projects/${projectId}/alerts/metric/validate`, settled] : null;

  const { data, error, isLoading } = useSWR<RuleCadence, Error>(key, post<RuleCadence>, SWR_OPTIONS);

  return {
    cadence: error ? undefined : data,
    error: error?.message,
    isChecking: enabled && (isLoading || body !== settled),
  };
};
