"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type MetricAlert, MetricRuleSchema, wholeNumberError } from "@/lib/actions/alerts/metric-rule";

import { useRuleCheck } from "../use-rule-requests";
import { cadenceLine, conditionSummary } from "../utils";
import ConditionStep from "./condition-step";
import { toRule } from "./form-rule";
import NotifyStep from "./notify-step";
import PreviewStep from "./preview-step";
import StepNav from "./step-nav";
import TemplateStep from "./template-step";
import { type FormTemplate } from "./templates";
import { type MetricAlertFormValues, type Step, STEPS } from "./types";
import { useSaveMetricAlert } from "./use-save-metric-alert";
import WatchStep from "./watch-step";

interface SheetFormProps {
  projectId: string;
  workspaceId: string;
  userEmail: string;
  integrationId?: string | null;
  slackAvailable: boolean;
  alert?: MetricAlert | null;
  defaultValues: MetricAlertFormValues;
  /** Skip the template step: the rule exists, or its entry point chose the metric. */
  skipTemplate: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export default function SheetForm({ alert, defaultValues, skipTemplate, onSaved, onClose, ...props }: SheetFormProps) {
  const { projectId, workspaceId, userEmail, integrationId, slackAvailable } = props;
  const steps = useMemo<readonly Step[]>(
    () => (skipTemplate ? STEPS.filter((step) => step !== "template") : STEPS),
    [skipTemplate]
  );
  const [step, setStep] = useState<Step>(steps[0]);
  const index = steps.indexOf(step);
  const isLast = index === steps.length - 1;

  const form = useForm<MetricAlertFormValues>({ defaultValues });
  const values = useWatch({ control: form.control }) as MetricAlertFormValues;
  const rule = toRule(values);
  const parsed = MetricRuleSchema.safeParse(rule);
  // The rule is only judged once its thresholds have been asked for.
  const showCheck = index >= steps.indexOf("condition");
  const check = useRuleCheck(projectId, rule, { enabled: showCheck });
  const { cadence, isChecking } = check;
  const error = (parsed.success ? undefined : wholeNumberError(parsed.error)) ?? check.error;
  const save = useSaveMetricAlert({ projectId, userEmail, integrationId, alert, onSaved });

  const pickTemplate = (template: FormTemplate) => {
    form.reset({ ...defaultValues, ...template.values });
    setStep("watch");
  };

  const invalid = !!error || isChecking;
  const unnamed = values.name.trim() === "";
  const blocked =
    step === "template" || (step === "watch" ? unnamed : step === "condition" || step === "preview" ? invalid : false);

  // Enter in a text field submits the form. Before the last step that only moves on.
  const onSubmit = async (submitted: MetricAlertFormValues) => {
    if (!isLast) {
      if (!blocked) setStep(steps[index + 1]);
      return;
    }
    if (invalid || unnamed) return;
    if (await save(submitted)) onClose();
  };

  return (
    <FormProvider {...form}>
      <form className="flex flex-1 flex-col overflow-hidden" onSubmit={form.handleSubmit(onSubmit)}>
        <StepNav steps={steps} current={step} onSelect={setStep} />
        <ScrollArea className="flex-1">
          <div className="p-4 pb-24">
            {step === "template" && <TemplateStep onPick={pickTemplate} />}
            {step === "watch" && <WatchStep />}
            {step === "condition" && <ConditionStep />}
            {step === "preview" && <PreviewStep projectId={projectId} rule={rule} alertId={alert?.id} />}
            {step === "notify" && (
              <NotifyStep
                workspaceId={workspaceId}
                userEmail={userEmail}
                integrationId={integrationId}
                slackAvailable={slackAvailable}
                summary={parsed.success ? conditionSummary(parsed.data) : ""}
              />
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-3 border-t px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
            {showCheck &&
              (error ? <span className="text-destructive-text">{error}</span> : cadence && cadenceLine(cadence))}
          </p>
          {index > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(steps[index - 1])}>
              Back
            </Button>
          )}
          {/* Keyed apart: a click on Next must not land on the submit button that takes its place. */}
          {isLast ? (
            <Button key="save" type="submit" disabled={form.formState.isSubmitting || invalid || unnamed}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {alert ? "Save" : "Create alert"}
            </Button>
          ) : (
            step !== "template" && (
              <Button key="next" type="button" disabled={blocked} onClick={() => setStep(steps[index + 1])}>
                Next
              </Button>
            )
          )}
        </div>
      </form>
    </FormProvider>
  );
}
