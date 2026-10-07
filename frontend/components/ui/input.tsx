import * as React from "react";

import { cn } from "@/lib/utils";

const sizeClasses = {
  xs: "h-7 text-xs placeholder:text-xs px-3 py-1 file:h-7 md:text-xs",
  sm: "h-8 text-sm placeholder:text-sm px-3 py-1 file:h-8 md:text-sm",
  md: "h-9 text-base placeholder:text-base px-3 py-1.5 file:h-9 md:text-base",
};

function Input({
  className,
  type,
  size = "xs",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: "xs" | "sm" | "md" }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-secondary transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        "focus-visible:border-primary",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
