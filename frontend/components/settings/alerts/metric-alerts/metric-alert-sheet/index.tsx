"use client";

import { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";

import { DEFAULT_FORM_VALUES, fromAlert } from "./form-rule";
import SheetForm from "./sheet-form";
import { type MetricAlertPreset } from "./types";

interface MetricAlertSheetProps {
  projectId: string;
  workspaceId: string;
  userEmail: string;
  /** False on plans without Slack delivery. */
  slackAvailable: boolean;
  /** The rule to edit. Leave out to create one. */
  alert?: MetricAlert | null;
  /** Values an entry point outside the settings page starts a new rule with. */
  preset?: MetricAlertPreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function MetricAlertSheet({
  alert,
  preset,
  open,
  onOpenChange,
  onSaved,
  ...props
}: MetricAlertSheetProps) {
  const { data: slackIntegration } = useSlackIntegration(props.workspaceId, props.slackAvailable);
  const defaultValues = alert ? fromAlert(alert, props.userEmail) : { ...DEFAULT_FORM_VALUES, ...preset };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-none! flex w-[45vw] min-w-[480px] flex-col gap-0 focus:outline-none"
      >
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle>{alert ? "Edit metric alert" : "New metric alert"}</SheetTitle>
          <SheetDescription className="sr-only">Set what to watch, when to alert and who to notify.</SheetDescription>
        </SheetHeader>
        {open && (
          <SheetForm
            key={alert?.id ?? preset?.metric ?? "new"}
            {...props}
            integrationId={slackIntegration?.id}
            alert={alert}
            defaultValues={defaultValues}
            skipTemplate={!!alert || !!preset}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
