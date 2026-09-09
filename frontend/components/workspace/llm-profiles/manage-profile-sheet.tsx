"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { buildDefaultValues, buildRequestBody } from "./build-values";
import { TextField } from "./field";
import { ModelsList } from "./models-list";
import { ProviderFields } from "./provider-fields";
import { ProviderSelect } from "./provider-select";
import { type LlmProfileFormValues, missingRequiredSecrets } from "./types";
import { useTestConnection } from "./use-test-connection";

interface ManageProfileSheetProps {
  workspaceId: string;
  profile: LlmProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function ManageProfileSheet({
  workspaceId,
  profile,
  open,
  onOpenChange,
  onSaved,
}: ManageProfileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-none! w-[40vw] min-w-[420px] flex flex-col gap-0 focus:outline-none"
      >
        <SheetHeader className="py-4 px-4 border-b">
          <SheetTitle>{profile ? "Edit LLM profile" : "New LLM profile"}</SheetTitle>
        </SheetHeader>
        {open && (
          <ProfileForm key={profile?.id ?? "new"} workspaceId={workspaceId} profile={profile} onSaved={onSaved} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProfileForm({
  workspaceId,
  profile,
  onSaved,
}: {
  workspaceId: string;
  profile: LlmProfile | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<LlmProfileFormValues>({ defaultValues: buildDefaultValues(profile), mode: "onChange" });
  const { control, handleSubmit, formState } = form;
  const connection = useTestConnection(form, workspaceId, profile);

  const onSubmit = async (values: LlmProfileFormValues) => {
    const missing = missingRequiredSecrets(values, profile);
    if (missing.length > 0) {
      toast({ variant: "destructive", title: `${missing[0]} is required` });
      return;
    }
    if (values.models.length === 0) {
      toast({ variant: "destructive", title: "Add at least one model" });
      return;
    }

    setIsSubmitting(true);
    try {
      const url = profile
        ? `/api/workspaces/${workspaceId}/llm-profiles/${profile.id}`
        : `/api/workspaces/${workspaceId}/llm-profiles`;
      const res = await fetch(url, {
        method: profile ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(values)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to save LLM profile");
      }
      toast({ title: profile ? "LLM profile updated" : "LLM profile created" });
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-4 p-4">
            <TextField name="name" label="Name" placeholder="e.g. Production OpenAI" required />
            <ProviderSelect />
            <ProviderFields existing={profile} />
            <Controller
              control={control}
              name="models"
              rules={{ validate: (v) => v.length > 0 || "Add at least one model" }}
              render={({ field, fieldState }) => (
                <ModelsList
                  models={field.value}
                  onChange={field.onChange}
                  statuses={connection.statuses}
                  hint="Model ids as the provider expects them (Azure: deployment names)."
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t">
          <Button type="button" variant="outline" disabled={!connection.canTest} onClick={connection.test}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": connection.isTesting })} size={14} />
            Test connection
          </Button>
          <Button type="submit" disabled={isSubmitting || !formState.isValid}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isSubmitting })} size={16} />
            {profile ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
