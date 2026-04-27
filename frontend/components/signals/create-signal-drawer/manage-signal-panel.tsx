"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

import ManageSignalContent from "./manage-signal-content";
import { getDefaultValues, type ManageSignalForm } from "./types";

interface Props {
  defaultValues?: ManageSignalForm;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  scrollAreaClassName?: string;
  className?: string;
}

export default function ManageSignalPanel({
  defaultValues: initialValues,
  onSuccess,
  className,
  scrollAreaClassName,
}: Props) {
  const { projectId } = useParams();
  const [showTest, setShowTest] = useState(false);
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

  // Re-sync form when the underlying signal changes (e.g. saved from elsewhere).
  useEffect(() => {
    form.reset(convertToFormValues(initialValues));
  }, [initialValues, form, convertToFormValues]);

  // After save, reset to the saved values so isDirty clears but the data stays on screen.
  const onSubmitComplete = useCallback(
    (data: ManageSignalForm) => {
      form.reset(data);
    },
    [form]
  );

  return (
    <FormProvider {...form}>
      <ManageSignalContent
        variant="panel"
        showTest={showTest}
        setShowTest={setShowTest}
        className={className}
        onSuccess={onSuccess}
        onSubmitComplete={onSubmitComplete}
        scrollAreaClassName={scrollAreaClassName}
        previousTriggerIds={previousTriggerIds}
      />
    </FormProvider>
  );
}
