"use client";

import Image from "next/image";

import okta from "@/assets/logo/okta.svg";
import { Button, type ButtonProps } from "@/components/ui/button";
import { IconSpinner } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface OktaButtonProps extends ButtonProps {
  text?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function OktaButton({
  text = "Continue with Okta",
  className,
  onClick,
  isLoading,
  isDisabled,
  ...props
}: OktaButtonProps) {
  return (
    <Button
      variant="light"
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className={cn("text-[16px] py-6 px-4 pr-6 w-full", className)}
      {...props}
    >
      <div className="h-5 w-5">
        {isLoading ? (
          <IconSpinner className="animate-spin" />
        ) : (
          <Image src={okta} alt="Okta Icon" width={20} height={20} />
        )}
      </div>
      <div className="ml-2">{text}</div>
    </Button>
  );
}
