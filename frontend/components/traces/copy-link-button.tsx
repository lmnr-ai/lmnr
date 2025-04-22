"use client";

import { Check, Link } from "lucide-react";
import { PropsWithChildren, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyLinkButtonProps {
  url: string;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function CopyLinkButton({
  url,
  className,
  variant = "outline",
  size = "default",
  children,
}: PropsWithChildren<CopyLinkButtonProps>) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);

      // Reset after 2 seconds
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
        <Check className={cn("h-4 w-4", { "mr-2": children })} />
      ) : (
        <Link className={cn("h-4 w-4", { "mr-2": children })} />
      )}
      {children}
    </Button>
  );
}
