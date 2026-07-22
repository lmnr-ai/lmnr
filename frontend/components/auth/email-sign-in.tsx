"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { signInLocalEmail } from "@/lib/auth-client";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

import LandingButton from "../landing/landing-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface EmailSignInProps {
  callbackUrl: string;
  action?: "sign_in_attempted" | "sign_up_attempted";
  className?: string;
}

const validateEmailAddress = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function EmailSignInButton({ callbackUrl, action = "sign_in_attempted", className }: EmailSignInProps) {
  const [email, setEmail] = useState("");
  const router = useRouter();

  const handleSignIn = async () => {
    track("auth", action, { provider: "email" }, { sendInstantly: true });
    try {
      const { error } = await signInLocalEmail({ email, name: email, callbackURL: callbackUrl });
      if (error) {
        toast.error(error.message || "Failed to sign in. Please try again.");
        return;
      }
      router.push(callbackUrl);
    } catch {
      toast.error("Failed to sign in. Please try again.");
    }
  };

  return (
    <div className={cn("h-full flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <Label className="text-sm text-muted-foreground text-left">Sign in with email (local only)</Label>
        <Input
          type="email"
          placeholder="Email"
          size="md"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits, scoped to the field (replaces the old global handleEnter).
            if (e.key === "Enter" && email && validateEmailAddress(email)) {
              void handleSignIn();
            }
          }}
        />
        {!validateEmailAddress(email) && email && (
          <Label className="text-sm text-muted-foreground"> Please enter a valid email address </Label>
        )}
      </div>
      <LandingButton
        variant="primary"
        size="sm"
        disabled={!email || !validateEmailAddress(email)}
        onClick={handleSignIn}
        className="w-full"
      >
        Sign in
      </LandingButton>
    </div>
  );
}
