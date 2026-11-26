import { type MetricRule } from "@/lib/actions/alerts/metric-rule";
import { METRIC_ALERT_TEMPLATES } from "@/lib/actions/alerts/metric-templates";

import { DEFAULT_FORM_VALUES, fromRule, toRule } from "./form-rule";
import { type MetricAlertFormValues } from "./types";

export interface FormTemplate {
  id: string;
  title: string;
  description: string;
  values: Partial<MetricAlertFormValues>;
}

export const BLANK_TEMPLATE_ID = "blank";

/** The shared templates as form values, plus an empty rule to start from. */
export const TEMPLATES: FormTemplate[] = [
  ...METRIC_ALERT_TEMPLATES.map(({ id, title, description, name, rule }) => ({
    id,
    title,
    description,
    values: { name, ...fromRule({ ...toRule(DEFAULT_FORM_VALUES), ...rule } as MetricRule) },
  })),
  { id: BLANK_TEMPLATE_ID, title: "Blank", description: "Start from an empty rule.", values: {} },
];
