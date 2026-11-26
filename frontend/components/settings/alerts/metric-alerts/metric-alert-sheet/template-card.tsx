import { DEFAULT_FORM_VALUES, thresholdsLine } from "./form-rule";
import { type Suggestion } from "./suggestions";
import { type FormTemplate } from "./templates";

interface TemplateCardProps {
  template: FormTemplate;
  /** Thresholds proposed from the project's last 7 days. */
  suggestion?: Suggestion;
  onPick: () => void;
}

export default function TemplateCard({ template, suggestion, onPick }: TemplateCardProps) {
  const line = thresholdsLine({ ...DEFAULT_FORM_VALUES, ...template.values, ...suggestion });
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex flex-col gap-1 rounded-md border bg-surface-up p-3 text-left transition-colors hover:overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm font-medium">{template.title}</span>
      <span className="text-xs text-muted-foreground">{template.description}</span>
      <span className="mt-auto pt-2 text-xs text-secondary-foreground tabular-nums">
        {line ? (suggestion ? `Suggested: ${line}` : line) : "You set the threshold"}
      </span>
    </button>
  );
}
