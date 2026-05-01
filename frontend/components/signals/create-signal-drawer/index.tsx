"use client";

import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

import ManageSignalContent from "./manage-signal-content";
import { getDefaultValues, type ManageSignalForm } from "./types";

export { default as ManageSignalPanel } from "./manage-signal-panel";
export { getDefaultValues, type ManageSignalForm } from "./types";

export default function CreateSignalDrawer({
  children,
  open,
  setOpen,
  defaultValues: initialValues,
  onSuccess,
}: PropsWithChildren<{
  open: boolean;
  setOpen: (open: boolean) => void;
  defaultValues?: ManageSignalForm;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
}>) {
  const { projectId } = useParams();
  const featureFlags = useFeatureFlags();
  const defaultMode = featureFlags[Feature.BATCH_SIGNALS] ? 0 : 1;

  const previousTriggerIds = useMemo(
    () => (initialValues?.triggers ?? []).filter((t) => t.id).map((t) => t.id!),
    [initialValues]
  );

  const convertToFormValues = useCallback(
    (values: ManageSignalForm | undefined): ManageSignalForm => {
      if (!values) return getDefaultValues(String(projectId), defaultMode);
      return values;
    },
    [projectId, defaultMode]
  );

  const form = useForm<ManageSignalForm>({
    defaultValues: convertToFormValues(initialValues),
    mode: "onChange",
  });

  useEffect(() => {
    if (open) {
      form.reset(convertToFormValues(initialValues));
    }
  }, [open, form, initialValues, convertToFormValues]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        form.reset(getDefaultValues(String(projectId), defaultMode));
      }
    },
    [form, projectId, defaultMode, setOpen]
  );

  const onClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const onSubmitComplete = useCallback(
    (_data: ManageSignalForm) => {
      setOpen(false);
      form.reset(getDefaultValues(String(projectId), defaultMode));
    },
    [form, projectId, defaultMode, setOpen]
  );

  return (
    <FormProvider {...form}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {children && <SheetTrigger asChild>{children}</SheetTrigger>}
        <SheetContent side="right" className="sm:max-w-none! p-0 flex flex-col w-[45vw]">
          <ManageSignalContent
            variant="sheet"
            onClose={onClose}
            onSuccess={onSuccess}
            onSubmitComplete={onSubmitComplete}
            previousTriggerIds={previousTriggerIds}
          />
        </SheetContent>
      </Sheet>
    </FormProvider>
  );
}
