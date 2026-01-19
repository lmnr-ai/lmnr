"use client";

import { Check, CopyIcon } from "lucide-react";
import { type MouseEvent, type PropsWithChildren, type ReactNode, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyLinkButtonProps {
  text: string;
  icon?: ReactNode;
  className?: string;
  iconClassName?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

export function CopyButton({
  text,
  className,
  icon,
  iconClassName,
  variant = "outline",
  size = "default",
  children,
}: PropsWithChildren<CopyLinkButtonProps>) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (e: MouseEvent<HTMLButtonElement>) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      await navigator.clipboard.writeText(text);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("transition-all ease-in-out duration-200", className)}
      onClick={copyToClipboard}
      aria-label={copied ? "Copied to clipboard" : "Copy link to clipboard"}
    >
      {copied ? (
        <Check className={cn("h-4 w-4", { "mr-2": children }, iconClassName)} />
      ) : (
        (icon ?? <CopyIcon className={cn("h-4 w-4", { "mr-2": children }, iconClassName)} />)
      )}
      {children}
    </Button>
  );
}
