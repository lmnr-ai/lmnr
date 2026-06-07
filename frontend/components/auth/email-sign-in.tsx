"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInLocalEmail } from "@/lib/auth-client";
import { track } from "@/lib/posthog";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface EmailSignInProps {
  callbackUrl: string;
  action?: "sign_in_attempted" | "sign_up_attempted";
}

const validateEmailAddress = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function EmailSignInButton({ callbackUrl, action = "sign_in_attempted" }: EmailSignInProps) {
  const [email, setEmail] = useState("");
  const router = useRouter();

  const handleSignIn = async () => {
    track("auth", action, { provider: "email" }, { sendInstantly: true });
    await signInLocalEmail({ email, name: email, callbackURL: callbackUrl });
    router.push(callbackUrl);
  };

  return (
    <div className="h-full flex flex-col space-y-2 mb-2 w-[350px]">
      <Label className="text-sm text-white text-center">This is a local-only feature. Simply enter any email.</Label>
      <Input
        type="email"
        placeholder="Email"
        className="border-white/50 text-white placeholder:text-white/50"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!validateEmailAddress(email) && email && (
        <Label className="text-sm text-white"> Please enter a valid email address </Label>
      )}
      <Button
        disabled={!email || !validateEmailAddress(email)}
        className="p-4"
        variant={"light"}
        onClick={handleSignIn}
        handleEnter
      >
        Sign in
      </Button>
    </div>
  );
}
