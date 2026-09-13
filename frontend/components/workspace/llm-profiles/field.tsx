"use client";

import { type ReactNode } from "react";
import { Controller, type FieldPath, useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SecretKey } from "@/lib/actions/llm-profiles/schema";

import { type LlmProfileFormValues } from "./types";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-secondary-foreground">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

type TextName = Extract<
  FieldPath<LlmProfileFormValues>,
  "name" | "region" | "accessKeyId" | "resourceId" | "baseUrl" | "apiVersion" | "apiKey" | "secretAccessKey" | "token"
>;

export function TextField({
  name,
  label,
  placeholder,
  hint,
  required,
}: {
  name: TextName;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<LlmProfileFormValues>();
  return (
    <Field label={label} hint={hint} error={errors[name]?.message}>
      <Input
        {...register(name, required ? { required: `${label} is required` } : undefined)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </Field>
  );
}

type ShapeName = Extract<FieldPath<LlmProfileFormValues>, "openaiShape" | "azureShape">;

/** Which of a provider's API endpoints the profile's deployments speak. */
export function ShapeSelect<N extends ShapeName>({
  name,
  options,
  hint,
}: {
  name: N;
  options: ReadonlyArray<{ value: LlmProfileFormValues[N]; label: string }>;
  hint?: string;
}) {
  const { control } = useFormContext<LlmProfileFormValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field label="API shape" hint={hint}>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

/**
 * Password input whose empty state on edit means "keep the stored value".
 * `stored` is the masked current value (e.g. `sk-******f4d`) or null when none is saved.
 */
export function SecretField({
  name,
  label,
  stored,
  required,
}: {
  name: Extract<TextName, SecretKey>;
  label: string;
  stored: string | null;
  required: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<LlmProfileFormValues>();
  return (
    <Field label={label} error={errors[name]?.message}>
      <Input
        // Plain text while nothing is saved yet so a pasted key can be checked; masked once one exists.
        type={stored ? "password" : "text"}
        {...register(name, required && !stored ? { required: `${label} is required` } : undefined)}
        placeholder={stored ?? undefined}
        // The UI font kerns `*` unevenly next to letters; monospace keeps the mask on one line.
        className="placeholder:font-mono"
        autoComplete="new-password"
      />
    </Field>
  );
}
