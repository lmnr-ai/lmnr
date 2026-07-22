"use client";

import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

/** Legacy shadcn/radix toast shape — kept so call sites need not change. */
type ToastInput = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
};

function toast({ title, description, variant = "default", duration }: ToastInput) {
  const message = title ?? description ?? "";
  const options = {
    description: title != null ? description : undefined,
    duration,
  };

  const id = variant === "destructive" ? sonnerToast.error(message, options) : sonnerToast(message, options);

  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastInput) => {
      const nextMessage = next.title ?? next.description ?? message;
      const nextOptions = {
        id,
        description: next.title != null ? next.description : undefined,
        duration: next.duration ?? duration,
      };
      if ((next.variant ?? variant) === "destructive") {
        sonnerToast.error(nextMessage, nextOptions);
      } else {
        sonnerToast(nextMessage, nextOptions);
      }
    },
  };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  };
}

export { toast, useToast };
