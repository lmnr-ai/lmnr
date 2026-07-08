import { Sparkles } from "lucide-react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type ManageTemplateForm } from "../index";

interface Props {
  title: string;
  isGenerating: boolean;
  describeText: string;
  onDescribeChange: (value: string) => void;
  onGenerate: () => void;
}

const LeftColumn = ({ title, isGenerating, describeText, onDescribeChange, onGenerate }: Props) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();
  const code = useWatch({ control, name: "code" });

  return (
    <div className="flex h-full w-[387px] shrink-0 flex-col gap-4 px-6 pb-4 pt-6 border-r">
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1 py-0.5">
          <p className="text-base text-foreground">{title}</p>
          <p className="max-w-[278px] text-sm text-secondary-foreground">
            Generate or write custom JSX to render your data however you want.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Controller
              rules={{ required: "Template name is required" }}
              name="name"
              control={control}
              render={({ field }) => (
                <Input size="sm" className="rounded border-border" placeholder="Template name" autoFocus {...field} />
              )}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <Textarea
            value={describeText}
            onChange={(e) => onDescribeChange(e.target.value)}
            disabled={isGenerating}
            className="min-h-0 flex-1 resize-none rounded border border-border px-4 py-3 text-sm text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={
              code?.trim() ? "Describe changes to your custom render template" : "Describe your custom render template"
            }
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="gap-1 rounded px-4 text-xs"
          size="md"
        >
          <Sparkles className="size-3" />
          <span className={cn(isGenerating && "shimmer")}>
            {isGenerating ? "Generating" : code?.trim() ? "Request changes" : "Generate"}
          </span>
        </Button>
      </div>
    </div>
  );
};

export default LeftColumn;
