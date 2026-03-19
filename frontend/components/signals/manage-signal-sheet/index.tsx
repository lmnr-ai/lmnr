"use client";

import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useMemo, useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import SignalFormFields from "./signal-form-fields";
import TestPanel from "./test-panel";
import { getDefaultValues, type ManageSignalForm, type TriggerFormItem } from "./types";
import useSubmitHandler from "./use-submit-handler";
import useTestExecution from "./use-test-execution";

export type { ManageSignalForm } from "./types";
export { getDefaultValues } from "./types";

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  const {
    watch,
    formState: { isValid },
  } = useFormContext<ManageSignalForm>();
  const id = watch("id");

  return (
    <Button type="submit" size="md" disabled={isLoading || !isValid}>
      <Loader2 className={cn("hidden", isLoading && "animate-spin block")} size={16} />
      {id ? "Save" : "Create"}
    </Button>
  );
}

type TestView = "picker" | "results";

function DrawerContent({
  setOpen,
  onSuccess,
  showTest,
  setShowTest,
  previousTriggerIds,
}: {
  setOpen: (open: boolean) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  showTest: boolean;
  setShowTest: (show: boolean) => void;
  previousTriggerIds: string[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const [testView, setTestView] = useState<TestView>("picker");

  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { isValid },
  } = useFormContext<ManageSignalForm>();
  const id = watch("id");

  const setFormId = useCallback((newId: string) => setValue("id", newId), [setValue]);
  const setFormTriggers = useCallback((triggers: TriggerFormItem[]) => setValue("triggers", triggers), [setValue]);

  const submit = useSubmitHandler({
    projectId: String(projectId),
    toast,
    setOpen,
    reset,
    onSuccess,
    setIsLoading,
    previousTriggerIds,
    setFormId,
    setFormTriggers,
  });

  const handleTestComplete = useCallback(() => {
    setTestView("results");
  }, []);

  const { isExecuting, testOutput, execute } = useTestExecution({
    getValues,
    projectId: String(projectId),
    selectedTrace,
    onComplete: handleTestComplete,
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left side — Form */}
      <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-5 pt-3">
          <SheetTitle className="text-base">{id ? "Edit Signal" : "Create Signal"}</SheetTitle>
          <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 px-5 py-4">
          <SignalFormFields showTemplates={!id} />
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          <Button
            type="button"
            size="md"
            variant={showTest ? "secondary" : "outline"}
            disabled={isLoading || !isValid}
            onClick={() => setShowTest(!showTest)}
          >
            Test
          </Button>
          <SubmitButton isLoading={isLoading} />
        </div>
      </form>

      {/* Right side — Test panel */}
      {showTest && (
        <TestPanel
          watch={watch}
          selectedTrace={selectedTrace}
          setSelectedTrace={setSelectedTrace}
          isExecuting={isExecuting}
          testOutput={testOutput}
          execute={execute}
          onClose={() => setShowTest(false)}
          testView={testView}
          setTestView={setTestView}
        />
      )}
    </div>
  );
}

export default function ManageSignalSheet({
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
  const [showTest, setShowTest] = useState(false);

  const previousTriggerIds = useMemo(
    () => (initialValues?.triggers ?? []).filter((t) => t.id).map((t) => t.id!),
    [initialValues]
  );

  const convertToFormValues = useCallback(
    (values: ManageSignalForm | undefined): ManageSignalForm => {
      if (!values) return getDefaultValues(String(projectId));
      return values;
    },
    [projectId]
  );

  const form = useForm<ManageSignalForm>({
    defaultValues: convertToFormValues(initialValues),
    mode: "onChange",
  });

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        form.reset(convertToFormValues(initialValues));
      } else {
        form.reset(getDefaultValues(String(projectId)));
        setShowTest(false);
      }
    },
    [form, initialValues, projectId, setOpen, convertToFormValues]
  );

  return (
    <FormProvider {...form}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {children && <SheetTrigger asChild>{children}</SheetTrigger>}
        <SheetContent
          side="right"
          className={cn(
            "sm:max-w-none! p-0 flex flex-col transition-[width] duration-300",
            showTest ? "w-[72vw]" : "w-[45vw]"
          )}
        >
          <DrawerContent
            setOpen={setOpen}
            onSuccess={onSuccess}
            showTest={showTest}
            setShowTest={setShowTest}
            previousTriggerIds={previousTriggerIds}
          />
        </SheetContent>
      </Sheet>
    </FormProvider>
  );
}
