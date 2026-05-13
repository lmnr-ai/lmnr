import { json } from "@codemirror/lang-json";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useCallback, useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/content-renderer/utils";

import { type ManageTemplateForm } from "../index";

const tryFormatJson = (raw: string | undefined): string | null => {
  if (!raw?.trim()) return null;
  try {
    const formatted = JSON.stringify(JSON.parse(raw), null, 2);
    return formatted === raw ? null : formatted;
  } catch {
    return null;
  }
};

const DataPanel = () => {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  // Pretty-print on mount so users always see formatted JSON without clicking.
  // Idempotent: if already formatted (or invalid), nothing changes. Doesn't mark
  // the field dirty — this is purely cosmetic, not a user edit.
  useEffect(() => {
    const formatted = tryFormatJson(getValues("testData"));
    if (formatted) {
      setValue("testData", formatted, { shouldDirty: false });
    }
  }, [getValues, setValue]);

  const handleFormat = useCallback(() => {
    const formatted = tryFormatJson(getValues("testData"));
    if (formatted) {
      setValue("testData", formatted, { shouldDirty: true });
    }
  }, [getValues, setValue]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Sample data passed to the template as <code className="font-mono">data</code>.
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={handleFormat} className="h-7 text-xs">
          Format
        </Button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
        <Controller
          name="testData"
          control={control}
          render={({ field }) => (
            <CodeMirror
              value={field.value}
              onChange={field.onChange}
              extensions={[json(), EditorView.lineWrapping]}
              theme={theme}
              className="h-full text-xs"
              placeholder='{"example": "data"}'
              height="100%"
            />
          )}
        />
      </div>
      {errors.testData && <p className="text-xs text-red-500">{errors.testData.message}</p>}
    </div>
  );
};

export default DataPanel;
