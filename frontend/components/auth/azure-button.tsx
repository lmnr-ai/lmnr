"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { IconAzure, IconSpinner } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface AzureButtonProps extends ButtonProps {
  text?: string;
  callbackUrl: string;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function AzureButton({
  text = "Continue with Microsoft",
  callbackUrl,
  className,
  onClick,
  isLoading,
  isDisabled,
  ...props
}: AzureButtonProps) {
  return (
    <Button
      variant="light"
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className={cn("text-[16px] py-6 px-4 pr-8 w-full", className)}
      {...props}
    >
      <div className="h-5 w-5">
        {isLoading ? (
          <IconSpinner className="animate-spin" />
        ) : (
          <IconAzure />
        )}
      </div>
      <div className="ml-4">{text}</div>
    </Button>
  );
}
