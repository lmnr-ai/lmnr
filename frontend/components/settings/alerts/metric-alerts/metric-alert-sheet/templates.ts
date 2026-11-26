import { type MetricRule } from "@/lib/actions/alerts/metric-rule";
import {
  METRIC_ALERT_TEMPLATES,
  type TemplateCategory,
  type TemplateSuggestion,
} from "@/lib/actions/alerts/metric-templates";

import { DEFAULT_FORM_VALUES, fromRule, toRule } from "./form-rule";
import { type MetricAlertFormValues } from "./types";

export interface FormTemplate {
  id: string;
  /** Missing on the empty rule, which sits outside the tabs. */
  category?: TemplateCategory;
  title: string;
  description: string;
  values: Partial<MetricAlertFormValues>;
  suggest?: TemplateSuggestion;
}

/** The shared templates as form values. */
export const TEMPLATES: FormTemplate[] = METRIC_ALERT_TEMPLATES.map(
  ({ id, category, title, description, name, rule, suggest }) => ({
    id,
    category,
    title,
    description,
    suggest,
    values: { name, ...fromRule({ ...toRule(DEFAULT_FORM_VALUES), ...rule } as MetricRule) },
  })
);

export const BLANK_TEMPLATE: FormTemplate = {
  id: "blank",
  title: "Start from scratch",
  description: "An empty rule.",
  values: {},
};
