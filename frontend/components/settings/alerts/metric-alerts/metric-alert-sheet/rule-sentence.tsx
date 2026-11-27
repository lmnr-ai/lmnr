import { type MetricRuleInput } from "@/lib/actions/alerts/metric-rule";
import { cn } from "@/lib/utils";

import { alertsWhen } from "../utils";

/** The rule read back in one sentence, so a wrong field is noticed before saving. */
export default function RuleSentence({ rule }: { rule: MetricRuleInput }) {
  const sentence = alertsWhen(rule);
  return (
    <p className={cn("rounded-md border bg-secondary/40 px-3 py-2 text-sm", !sentence && "text-muted-foreground")}>
      {sentence ?? "Set a threshold to see when this alerts."}
    </p>
  );
}
