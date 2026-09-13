"use client";

import { Controller, useFormContext } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type LlmProfile, type SecretKey } from "@/lib/actions/llm-profiles/schema";

import { CustomHeadersFields } from "./custom-headers-fields";
import { Field, SecretField, ShapeSelect, TextField } from "./field";
import { AZURE_SHAPE_OPTIONS, type LlmProfileFormValues, OPENAI_SHAPE_OPTIONS, sameProviderFamily } from "./types";

/** Hardcoded field set per provider. `existing` drives the "keep stored secret" affordance. */
export function ProviderFields({ existing }: { existing?: LlmProfile | null }) {
  const { control, watch } = useFormContext<LlmProfileFormValues>();
  const values = watch();
  const sameProvider = sameProviderFamily(values, existing);
  const stored = (key: SecretKey) => (sameProvider ? (existing?.secrets[key] ?? null) : null);

  switch (values.uiProvider) {
    case "openai":
      return (
        <>
          <ShapeSelect name="openaiShape" options={OPENAI_SHAPE_OPTIONS} />
          <SecretField name="apiKey" label="API key" stored={stored("apiKey")} required />
        </>
      );
    case "bedrock":
      return (
        <>
          <TextField name="region" label="AWS region" placeholder="us-east-1" required />
          <Controller
            control={control}
            name="bedrockAuth"
            render={({ field }) => (
              <Field label="Authentication">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aws_keys">Access key + secret</SelectItem>
                    <SelectItem value="bearer_token">Bedrock API key (bearer token)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          {values.bedrockAuth === "aws_keys" ? (
            <>
              <TextField name="accessKeyId" label="Access key ID" placeholder="AKIA..." required />
              <SecretField
                name="secretAccessKey"
                label="Secret access key"
                stored={stored("secretAccessKey")}
                required
              />
            </>
          ) : (
            <SecretField name="token" label="Bearer token" stored={stored("token")} required />
          )}
        </>
      );
    case "azure":
      return (
        <>
          <ShapeSelect
            name="azureShape"
            options={AZURE_SHAPE_OPTIONS}
            hint="One Foundry resource serves all three; pick the one your deployment speaks."
          />
          <Controller
            control={control}
            name="azureEndpoint"
            render={({ field }) => (
              <Field label="Endpoint">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resourceId">Resource name</SelectItem>
                    <SelectItem value="baseUrl">Full base URL</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          {values.azureEndpoint === "resourceId" ? (
            <TextField
              name="resourceId"
              label="Resource name"
              placeholder="my-resource"
              hint="The <name> in https://<name>.services.ai.azure.com"
              required
            />
          ) : (
            <TextField name="baseUrl" label="Base URL" placeholder="https://my-gateway.example.com" required />
          )}
          <TextField name="apiVersion" label="API version (optional)" placeholder="preview" />
          <SecretField name="apiKey" label="API key" stored={stored("apiKey")} required />
        </>
      );
    case "custom":
      return (
        <>
          <TextField
            name="baseUrl"
            label="Base URL"
            placeholder="https://gateway.example.com/v1"
            hint="OpenAI Chat Completions root; /chat/completions is appended."
            required
          />
          <SecretField name="apiKey" label="API key" stored={stored("apiKey")} required />
          <CustomHeadersFields storedHeaderNames={sameProvider ? (existing?.secrets.headers ?? []) : []} />
        </>
      );
    default:
      return <SecretField name="apiKey" label="API key" stored={stored("apiKey")} required />;
  }
}
