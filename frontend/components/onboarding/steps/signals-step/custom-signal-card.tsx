import { Plus } from "lucide-react";

/** Not selectable: tells the user any signal can be created after onboarding. */
export default function CustomSignalCard() {
  return (
    <div className="grid bg-emphasis-0.5 grid-cols-[auto_1fr] content-start items-start gap-x-3 rounded-md outline-1 -outline-offset-1 outline-dashed outline-border p-3 2xl:p-4 sm:grid-cols-1 sm:gap-y-3">
      <Plus className="h-5 w-5 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <span className="text-sm 2xl:text-base font-medium text-secondary-foreground">Custom</span>
        <span className="text-xs 2xl:text-sm text-muted-foreground">
          Describe anything you want to find in your traces and create your own signal anytime.
        </span>
      </div>
    </div>
  );
}
