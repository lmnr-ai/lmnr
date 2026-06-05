"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OAuthDeviceCodeInput() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 8) return;
    router.push(`/oauth/device?user_code=${encodeURIComponent(`${normalized.slice(0, 4)}-${normalized.slice(4)}`)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono tracking-widest text-center"
      />
      <Button type="submit">Continue</Button>
    </form>
  );
}
