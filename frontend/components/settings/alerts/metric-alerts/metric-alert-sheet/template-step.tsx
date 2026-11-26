import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TEMPLATE_CATEGORIES } from "@/lib/actions/alerts/metric-templates";

import { type Suggestion } from "./suggestions";
import TemplateCard from "./template-card";
import { BLANK_TEMPLATE, type FormTemplate, TEMPLATES } from "./templates";

interface TemplateStepProps {
  /** By template id. Empty until the project's data has been read. */
  suggestions: Record<string, Suggestion>;
  onPick: (template: FormTemplate) => void;
}

export default function TemplateStep({ suggestions, onPick }: TemplateStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue={TEMPLATE_CATEGORIES[0]} className="gap-3">
        <TabsList size="sm">
          {TEMPLATE_CATEGORIES.map((category) => (
            <TabsTrigger key={category} value={category} className="px-3">
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
        {TEMPLATE_CATEGORIES.map((category) => (
          <TabsContent key={category} value={category} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TEMPLATES.filter((template) => template.category === category).map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                suggestion={suggestions[template.id]}
                onPick={() => onPick(template)}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Suggested thresholds sit above this project&apos;s usual peak in the last 7 days. Every number can be changed in
        the next steps.
      </p>
      <button
        type="button"
        onClick={() => onPick(BLANK_TEMPLATE)}
        className="self-start text-xs text-secondary-foreground underline underline-offset-2 hover:text-foreground"
      >
        {BLANK_TEMPLATE.title}
      </button>
    </div>
  );
}
