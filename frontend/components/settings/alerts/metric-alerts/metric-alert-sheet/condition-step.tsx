import { useFormContext } from "react-hook-form";

import { type MetricRuleInput } from "@/lib/actions/alerts/metric-rule";

import { METRIC_META, UNIT_SUFFIX } from "../constants";
import AdvancedFields from "./advanced-fields";
import ConditionTypeField from "./condition-type-field";
import Field from "./field";
import NumberInput from "./number-input";
import RuleSentence from "./rule-sentence";
import SpendingLimitFields from "./spending-limit-fields";
import SuggestionHint from "./suggestion-hint";
import { type Suggestion } from "./suggestions";
import ThresholdFields from "./threshold-fields";
import { type MetricAlertFormValues } from "./types";
import WindowFields from "./window-fields";

interface ConditionStepProps {
  /** The rule the form describes so far. */
  rule: MetricRuleInput;
  suggestion?: Suggestion;
}

export default function ConditionStep({ rule, suggestion }: ConditionStepProps) {
  const { register, watch } = useFormContext<MetricAlertFormValues>();
  const [metric, conditionType] = watch(["metric", "conditionType"]);

  return (
    <div className="flex flex-col gap-5">
      <ConditionTypeField />
      {conditionType === "spending_limit" ? (
        <SpendingLimitFields />
      ) : (
        <>
          <WindowFields />
          <ThresholdFields />
          {conditionType === "change" && (
            <Field
              label="Minimum change"
              hint="Ignore a change smaller than this amount, so a move from $0.10 to $0.40 does not count as +300%."
            >
              <NumberInput unit={UNIT_SUFFIX[METRIC_META[metric].unit]} min={0} {...register("minChange")} />
            </Field>
          )}
        </>
      )}
      <SuggestionHint suggestion={suggestion} />
      <RuleSentence rule={rule} />
      <AdvancedFields />
    </div>
  );
}
