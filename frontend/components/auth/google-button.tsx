"use client";

import Image from "next/image";
import * as React from "react";

import google from "@/assets/logo/google.svg";
import { Button, type ButtonProps } from "@/components/ui/button";
import { IconSpinner } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface GoogleButtonProps extends ButtonProps {
  text?: string;
  callbackUrl: string;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export function GoogleButton({
  text = "Continue with Google",
  callbackUrl,
  className,
  onClick,
  isLoading,
  isDisabled,
  ...props
}: GoogleButtonProps) {
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
          <Image src={google} alt="Google Icon" width={20} height={20} />
        )}
      </div>
      <div className="ml-4">{text}</div>
    </Button>
  );
}
