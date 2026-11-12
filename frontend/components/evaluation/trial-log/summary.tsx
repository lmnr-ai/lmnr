import useSWR from "swr";

import { formatDurationMs } from "@/lib/traces/format";

import { summarizeResult, type TrialSummary as Summary } from "./utils";

const fetchSummary = async (url: string): Promise<Summary | null> => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return summarizeResult(await response.text());
};

/** Phase timings and the exception, if any, from the trial's `result.json`. */
export default function TrialSummary({ url }: { url: string }) {
  const { data } = useSWR(url, fetchSummary, { revalidateOnFocus: false, revalidateIfStale: false });
  if (!data || (data.durations.length === 0 && !data.exception)) return null;

  return (
    <div className="flex flex-none flex-col gap-1 border-b px-3 py-2 text-xs">
      {data.durations.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {data.durations.map(({ label, ms }) => (
            <span key={label}>
              {label} <span className="font-mono text-foreground">{formatDurationMs(ms)}</span>
            </span>
          ))}
        </div>
      )}
      {data.exception && (
        <p className="break-words font-mono text-destructive">
          {data.exception.type}: {data.exception.message}
        </p>
      )}
    </div>
  );
}
