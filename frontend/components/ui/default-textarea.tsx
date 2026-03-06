import React from "react";
import TextareaAutosize, { type TextareaAutosizeProps } from "react-textarea-autosize";

import { cn } from "@/lib/utils";

const DefaultTextarea = ({ className, ...props }: TextareaAutosizeProps) => (
  <TextareaAutosize
    className={cn(
      "text-xs min-h-[8px] bg-background p-2 m-0 border border-border rounded-md focus:outline-hidden focus:border-primary/50 resize-none transition-colors duration-150",
      className
    )}
    {...props}
  />
);

export default DefaultTextarea;
