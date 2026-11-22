import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { type TrialFiles } from "@/lib/evaluation/trial-files";
import { type EvalRow, type Evaluation } from "@/lib/evaluation/types";

import { filesAvailability, mayHaveTaskVersion, showFilesToggle } from "./utils";

interface UseTrialFilesArgs {
  projectId: string;
  evaluation: Evaluation | undefined;
  row: EvalRow | undefined;
  isShared: boolean;
  /** Files is the open panel. Remote runs always offer it, so they only fetch the listing then. */
  isOpen: boolean;
}

/**
 * The selected trial's Files listing and whether the panel offers it. A local
 * run's trial is looked up (whatever the open panel, the toggle depends on it)
 * only when it can have a pushed task version.
 */
export const useTrialFiles = ({ projectId, evaluation, row, isShared, isOpen }: UseTrialFilesArgs) => {
  const trialId = row?.["id"] as string | undefined;
  const isHosted = !!evaluation?.hostedMetadata;
  const canLookUp = isHosted || mayHaveTaskVersion(row, evaluation?.datasetV2Id);
  const url =
    !isShared && evaluation && trialId && canLookUp && (isOpen || !isHosted)
      ? `/api/projects/${projectId}/evaluations/${evaluation.id}/trials/${trialId}/files`
      : null;

  // keepPreviousData: while the next trial loads, the toggle keeps the previous trial's state.
  const { data, error } = useSWR<TrialFiles>(url, swrFetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const listing = data?.trialId === trialId ? data : undefined;
  const current = error ? null : listing;
  const availability = filesAvailability({ isShared, isHosted, canLookUp, listing: url ? current : null });

  return {
    listing,
    error: error instanceof Error ? error.message : error ? "Failed to load the files" : null,
    availability,
    showToggle: showFilesToggle(availability, data),
  };
};
