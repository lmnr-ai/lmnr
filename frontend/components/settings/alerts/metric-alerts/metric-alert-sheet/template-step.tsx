import { type FormTemplate, TEMPLATES } from "./templates";

export default function TemplateStep({ onPick }: { onPick: (template: FormTemplate) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onPick(template)}
          className="flex flex-col gap-1 rounded-md border bg-surface-up p-3 text-left transition-colors hover:overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-sm font-medium">{template.title}</span>
          <span className="text-xs text-muted-foreground">{template.description}</span>
        </button>
      ))}
    </div>
  );
}
