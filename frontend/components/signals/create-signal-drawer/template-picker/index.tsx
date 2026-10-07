"use client";

import { AlertCircle, Brain, CheckCircle, CloudOff, Frown, Plus, Shield, Target, Zap } from "lucide-react";

import templates, { type EventTemplate } from "@/components/signals/prompts";
import { Label } from "@/components/ui/label";

import TemplateItem from "./template-item";

const TEMPLATE_ICONS: Record<EventTemplate["icon"], React.ComponentType<{ className?: string }>> = {
  "alert-circle": AlertCircle,
  brain: Brain,
  "check-circle": CheckCircle,
  frown: Frown,
  zap: Zap,
  shield: Shield,
  "cloud-off": CloudOff,
  target: Target,
};

export default function TemplatePicker({
  onApply,
  onClear,
}: {
  onApply: (index: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">Template</Label>
      <div className="grid grid-cols-4 gap-1.5">
        {templates.map((template, index) => {
          const Icon = TEMPLATE_ICONS[template.icon];
          return (
            <TemplateItem
              key={template.name}
              icon={Icon}
              label={template.shortName}
              extendedLabel={template.name}
              description={template.description}
              onClick={() => onApply(index)}
            />
          );
        })}
        <TemplateItem
          icon={Plus}
          label="Blank"
          extendedLabel="Start from scratch"
          description="Create a custom signal"
          onClick={onClear}
          dashed
        />
      </div>
    </div>
  );
}
