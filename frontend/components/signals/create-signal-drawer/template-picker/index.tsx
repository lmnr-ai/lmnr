"use client";

import { AlertCircle, Frown, Plus, Target } from "lucide-react";

import templates, { type EventTemplate } from "@/components/signals/prompts";
import { Label } from "@/components/ui/label";

import TemplateItem from "./template-item";

const TEMPLATE_ICONS: Record<EventTemplate["icon"], React.ComponentType<{ className?: string }>> = {
  "alert-circle": AlertCircle,
  frown: Frown,
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
        {templates.map((template, index) => (
          <TemplateItem
            key={template.name}
            icon={TEMPLATE_ICONS[template.icon]}
            label={template.name}
            onClick={() => onApply(index)}
          />
        ))}
        <TemplateItem icon={Plus} label="Blank" onClick={onClear} dashed />
      </div>
    </div>
  );
}
