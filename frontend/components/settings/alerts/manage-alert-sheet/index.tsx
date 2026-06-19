"use client";

import useSWR from "swr";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { type Signal, type SignalRow } from "@/lib/actions/signals";
import { swrFetcher } from "@/lib/utils";

import { type AlertFilterFormItem } from "../alert-filters-section";
import { AlertForm } from "./alert-form";
import { buildDefaultValues } from "./build-default-values";
import { AlertFormSkeleton } from "./skeleton";

interface ManageAlertSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId?: string | null;
  alert?: AlertWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  userEmail: string;
  /** When set, the alert is scoped to this signal and the signal selector is hidden. */
  fixedSignalId?: string;
}

export default function ManageAlertSheet({
  projectId,
  workspaceId,
  integrationId,
  alert,
  open,
  onOpenChange,
  onSaved,
  userEmail,
  fixedSignalId,
}: ManageAlertSheetProps) {
  const isEditMode = !!alert;

  // Load everything the form needs for its initial values, then mount it once
  // ready — keeps init synchronous in useForm's defaultValues, no reset effect.
  const { data: signalsData } = useSWR<{ items: SignalRow[] }>(
    open ? `/api/projects/${projectId}/signals?pageNumber=0&pageSize=100` : null,
    swrFetcher
  );

  // The bound signal may fall outside the paginated list; fetch it by id.
  const boundSignalId = fixedSignalId ?? alert?.sourceId;
  const { data: boundSignal, error: boundSignalError } = useSWR<Signal>(
    open && boundSignalId ? `/api/projects/${projectId}/signals/${boundSignalId}` : null,
    swrFetcher
  );

  const { data: existingFilters, error: existingFiltersError } = useSWR<{ items: AlertFilterFormItem[] }>(
    open && isEditMode && alert ? `/api/projects/${projectId}/alerts/${alert.id}/filters` : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  // Errored fetches count as settled so a failure can't trap the skeleton forever.
  const signalsReady = signalsData !== undefined;
  const boundSignalReady = !boundSignalId || boundSignal !== undefined || boundSignalError !== undefined;
  const filtersReady = !isEditMode || existingFilters !== undefined || existingFiltersError !== undefined;
  const ready = signalsReady && boundSignalReady && filtersReady;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-none! w-[45vw] flex flex-col gap-0 focus:outline-none">
        <SheetHeader className="py-4 px-4 border-b">
          <SheetTitle>{isEditMode ? "Edit alert" : "New alert"}</SheetTitle>
        </SheetHeader>
        {ready ? (
          <AlertForm
            key={alert?.id ?? "new"}
            projectId={projectId}
            workspaceId={workspaceId}
            integrationId={integrationId}
            alert={alert}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
            userEmail={userEmail}
            fixedSignalId={fixedSignalId}
            signals={signalsData?.items ?? []}
            boundSignal={boundSignal}
            previousFilterIds={(existingFilters?.items ?? []).filter((t) => t.id).map((t) => t.id!)}
            defaultValues={buildDefaultValues({
              alert,
              fixedSignalId,
              signals: signalsData?.items ?? [],
              boundSignal,
              existingFilters,
              userEmail,
            })}
          />
        ) : (
          <AlertFormSkeleton />
        )}
      </SheetContent>
    </Sheet>
  );
}
