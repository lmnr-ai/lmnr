"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";

interface LicenseKeyFormProps {
  workspaceId: string;
  hasLicense: boolean;
}

export default function LicenseKeyForm({ workspaceId, hasLicense }: LicenseKeyFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [key, setKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/license`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast({ variant: "destructive", title: "License not saved", description: body?.error ?? "Please try again." });
        return;
      }
      toast({ title: "License saved", description: "Enterprise features are enabled." });
      setKey("");
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "License not saved", description: "Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="lmnr_lic_…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <Button type="submit" disabled={!key.trim() || isSaving}>
          {hasLicense ? "Replace license" : "Add license"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The key is checked before it is saved. Once added, a license can be replaced with another valid key but not
        removed.
      </p>
    </form>
  );
}
