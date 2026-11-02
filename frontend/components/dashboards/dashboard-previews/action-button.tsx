import { type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A round action button; emphasis tokens are translucent, so it sits on an opaque base. */
const ActionButton = ({ className, ...props }: ComponentProps<"button">) => (
  <div className="rounded-full bg-background">
    <button
      type="button"
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-foreground-300 transition-colors hover:bg-emphasis-1 hover:text-foreground-200 active:bg-emphasis-2",
        className
      )}
      {...props}
    />
  </div>
);

export default ActionButton;
