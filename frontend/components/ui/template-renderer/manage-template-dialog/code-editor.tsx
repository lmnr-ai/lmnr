import { javascript } from "@codemirror/lang-javascript";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Controller, useFormContext } from "react-hook-form";

import { theme } from "@/components/ui/content-renderer/utils";

import { type ManageTemplateForm } from "../index";

const CodeEditor = () => {
  const {
    control,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30">
        <Controller
          name="code"
          control={control}
          render={({ field }) => (
            <CodeMirror
              value={field.value}
              onChange={field.onChange}
              extensions={[javascript({ jsx: true }), EditorView.lineWrapping]}
              theme={theme}
              className="h-full text-xs"
              height="100%"
            />
          )}
        />
      </div>
      {errors.code && (
        <p className="border-t border-destructive/30 bg-destructive/5 px-3 py-1 text-xs text-destructive">
          {errors.code.message}
        </p>
      )}
    </div>
  );
};

export default CodeEditor;
