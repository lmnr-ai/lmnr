"use client";

import type { ReactNode } from "react";
import { toast as sonnerToast, Toaster as Sonner, type ToasterProps } from "sonner";

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

  if (variant === "destructive") {
    sonnerToast.error(message, options);
  } else {
    sonnerToast(message, options);
  }
}

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg !pr-6",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Match prior radix ToastClose (absolute right-1 top-1, flat X — not Sonner's corner badge)
          closeButton:
            "!left-auto !right-1 !top-1 ![transform:none] !size-6 !rounded-md !border-0 !bg-transparent !p-1 !text-foreground/50 hover:!bg-transparent hover:!text-foreground",
          error:
            "group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive",
        },
      }}
      {...props}
    />
  );
}

export { toast, Toaster };
