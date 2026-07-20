import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/ui/icon-lib";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type ManageTemplateForm } from "../index";

interface Props {
  isGenerating: boolean;
  describeText: string;
  onDescribeChange: (value: string) => void;
  onGenerate: () => void;
}

const LeftColumn = ({ isGenerating, describeText, onDescribeChange, onGenerate }: Props) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();
  const code = useWatch({ control, name: "code" });

  return (
    <div className="flex h-full w-[387px] shrink-0 flex-col gap-4 px-5 pb-4 pt-4 border-r">
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

        {/* Native <textarea> text can't take background-clip:text, so during
            generation we hide the real text and overlay a shimmering copy that
            mirrors its padding/typography. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Textarea
            value={describeText}
            onChange={(e) => onDescribeChange(e.target.value)}
            disabled={isGenerating}
            className={cn(
              "min-h-0 flex-1 resize-none rounded border border-border px-4 py-3 text-sm text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
              isGenerating && "text-transparent disabled:opacity-100"
            )}
            placeholder={
              code?.trim()
                ? "Describe changes to your custom render template"
                : "Generate custom JSX to render your data however you want."
            }
          />
          {isGenerating && describeText && (
            <div
              aria-hidden
              // Muted greys, not bright white: base = muted-foreground (currentColor),
              // highlight pinned to the lighter secondary-foreground. Setting
              // shimmer-color also bypasses tw-shimmer's dark-mode brighten-to-white.
              className="shimmer shimmer-color-secondary-foreground pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-sm text-muted-foreground"
            >
              {describeText}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
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
