"use client";

import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import SignalFormFields from "./signal-form-fields";
import TestPanel, { type TestView } from "./test-panel";
import TestPanelDrawer from "./test-panel-drawer";
import { type ManageSignalForm, type TriggerFormItem } from "./types";
import useSubmitHandler from "./use-submit-handler";
import useTestExecution from "./use-test-execution";

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

export type ManageSignalContentVariant = "sheet" | "panel";

interface ManageSignalContentProps {
  variant: ManageSignalContentVariant;
  showTest: boolean;
  setShowTest: (show: boolean) => void;
  onClose?: () => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  onSubmitComplete: (data: ManageSignalForm) => void;
  previousTriggerIds: string[];
  className?: string;
  scrollAreaClassName?: string;
}

export default function ManageSignalContent({
  variant,
  showTest,
  setShowTest,
  onClose,
  onSuccess,
  onSubmitComplete,
  previousTriggerIds,
  className,
  scrollAreaClassName,
}: ManageSignalContentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const [testView, setTestView] = useState<TestView>("picker");

  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    handleSubmit,
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
    onSubmitComplete,
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

  const formNode = (
    <form onSubmit={handleSubmit(submit)} className={cn("flex flex-col flex-1 overflow-hidden min-w-0", className)}>
      {variant === "sheet" && (
        <div className="flex items-center justify-between px-5 pt-3">
          <SheetTitle className="text-base">{id ? "Edit Signal" : "Create Signal"}</SheetTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      <ScrollArea className={cn("flex-1 px-5 flex flex-col items-center w-full")}>
        <SignalFormFields showTemplates={!id} className={cn("", scrollAreaClassName)} />
      </ScrollArea>
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
  );

  if (variant === "sheet") {
    return (
      <div className="flex h-full overflow-hidden">
        {formNode}
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

  return (
    <div className="flex h-full overflow-hidden">
      {formNode}
      <TestPanelDrawer
        open={showTest}
        onOpenChange={setShowTest}
        watch={watch}
        selectedTrace={selectedTrace}
        setSelectedTrace={setSelectedTrace}
        isExecuting={isExecuting}
        testOutput={testOutput}
        execute={execute}
        testView={testView}
        setTestView={setTestView}
      />
    </div>
  );
}
