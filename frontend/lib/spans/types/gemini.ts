import { map } from "lodash";
import { z } from "zod/v4";

import { type Message } from "@/lib/playground/types";
import { isStorageUrl, urlToBase64 } from "@/lib/s3";


/** Part Schemas **/

// Common optional fields that can appear on any part
const GeminiPartMetadataSchema = z.object({
  thought: z.boolean().optional(),
  thoughtSignature: z.string().optional(),
  partMetadata: z.record(z.string(), z.unknown()).optional(),
  videoMetadata: z
    .object({
      startOffset: z.string().optional(),
      endOffset: z.string().optional(),
    })
    .optional(),
});

export const GeminiTextPartSchema = GeminiPartMetadataSchema.extend({
  text: z.string(),
});

export const GeminiInlineDataPartSchema = GeminiPartMetadataSchema.extend({
  inlineData: z.object({
    mimeType: z.string(),
    data: z.string(),
  }),
});

export const GeminiFileDataPartSchema = GeminiPartMetadataSchema.extend({
  fileData: z.object({
    mimeType: z.string().optional(),
    fileUri: z.string(),
  }),
});

export const GeminiFunctionCallPartSchema = GeminiPartMetadataSchema.extend({
  functionCall: z.object({
    id: z.string().optional(),
    name: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const GeminiFunctionResponsePartSchema = GeminiPartMetadataSchema.extend({
  functionResponse: z.object({
    id: z.string().optional(),
    name: z.string(),
    response: z.record(z.string(), z.unknown()),
  }),
});

export const GeminiExecutableCodePartSchema = GeminiPartMetadataSchema.extend({
  executableCode: z.object({
    language: z.enum(["LANGUAGE_UNSPECIFIED", "PYTHON"]),
    code: z.string(),
  }),
});

export const GeminiCodeExecutionResultPartSchema = GeminiPartMetadataSchema.extend({
  codeExecutionResult: z.object({
    outcome: z.enum(["OUTCOME_UNSPECIFIED", "OUTCOME_OK", "OUTCOME_FAILED", "OUTCOME_DEADLINE_EXCEEDED"]),
    output: z.string().optional(),
  }),
});

export const GeminiPartSchema = z.union([
  GeminiTextPartSchema,
  GeminiInlineDataPartSchema,
  GeminiFileDataPartSchema,
  GeminiFunctionCallPartSchema,
  GeminiFunctionResponsePartSchema,
  GeminiExecutableCodePartSchema,
  GeminiCodeExecutionResultPartSchema,
]);

/** Message Schemas **/

// Note: In the official Gemini API, `role` is optional and only allows "user" or "model".
// We include "system" here because our internal tracing pipeline synthesizes a system
// message for display purposes. System instructions are actually sent via a separate
// `system_instruction` field on GenerateContentRequest.
export const GeminiContentSchema = z.object({
  role: z.enum(["user", "model", "system"]).optional(),
  parts: z.array(GeminiPartSchema),
});

export const GeminiContentsSchema = z.array(GeminiContentSchema);


/** Candidate Schema (output format) **/

// A Candidate wraps a Content with generation metadata.
// See: https://ai.google.dev/api/generate-content#v1beta.Candidate
export const GeminiCandidateSchema = z
  .object({
    content: GeminiContentSchema,
    finish_reason: z.string().optional(),
    avg_logprobs: z.number().optional(),
    index: z.number().optional(),
  })
  .passthrough(); // preserve any extra metadata we don't explicitly model

export const GeminiCandidatesSchema = z.array(GeminiCandidateSchema);

/** High-level input / output schemas **/

// Input is always Content(s)
export const GeminiInputSchema = z.union([GeminiContentSchema, GeminiContentsSchema]);

// Output is always Candidate(s)
export const GeminiOutputSchema = z.union([GeminiCandidateSchema, GeminiCandidatesSchema]);

/** Parse helpers — validate + normalise into a Contents array **/

/** Try to parse `data` as Gemini input (Content or Content[]). Returns null on mismatch. */
export const parseGeminiInput = (data: unknown): z.infer<typeof GeminiContentsSchema> | null => {
  const result = GeminiInputSchema.safeParse(data);
  if (!result.success) return null;
  return Array.isArray(result.data) ? result.data : [result.data];
};

/** Try to parse `data` as Gemini output (Candidate or Candidate[]). Returns null on mismatch. */
export const parseGeminiOutput = (data: unknown): z.infer<typeof GeminiContentsSchema> | null => {
  const result = GeminiOutputSchema.safeParse(data);
  if (!result.success) return null;
  const candidates = Array.isArray(result.data) ? result.data : [result.data];
  return candidates.map((c) => c.content);
};


/** Conversion Functions **/

export const convertGeminiToPlaygroundMessages = async (
  messages: z.infer<typeof GeminiContentsSchema>
): Promise<Message[]> => {
  return Promise.all(
    map(messages, async (message): Promise<Message> => {
      const content: Message["content"] = [];

      // Gemini parts use field-presence discrimination (no "type" key).
      // Unrecognised variants are skipped.
      for (const part of message.parts) {
        if ("text" in part) {
          content.push({ type: "text", text: part.text });
        } else if ("inlineData" in part) {
          if (part.inlineData.mimeType.startsWith("image/")) {
            let imageData = part.inlineData.data;
            if (isStorageUrl(imageData)) {
              try {
                imageData = await urlToBase64(imageData);
              } catch (error) {
                console.error("Error downloading inline image:", error);
              }
            }
            content.push({
              type: "image",
              image: imageData.startsWith("data:")
                ? imageData
                : `data:${part.inlineData.mimeType};base64,${imageData}`,
            });
          } else {
            content.push({
              type: "text",
              text: `[Inline ${part.inlineData.mimeType} data]`,
            });
          }
        } else if ("fileData" in part) {
          if (part.fileData.mimeType?.startsWith("image/") && isStorageUrl(part.fileData.fileUri)) {
            try {
              const base64 = await urlToBase64(part.fileData.fileUri);
              content.push({ type: "image", image: base64 });
            } catch (error) {
              console.error("Error downloading file image:", error);
              content.push({ type: "text", text: `[File: ${part.fileData.fileUri}]` });
            }
          } else {
            content.push({ type: "text", text: `[File: ${part.fileData.fileUri}]` });
          }
        } else if ("functionCall" in part) {
          content.push({
            type: "tool-call",
            toolCallId: part.functionCall.id ?? part.functionCall.name,
            toolName: part.functionCall.name,
            input: { type: "json", value: JSON.stringify(part.functionCall.args ?? {}) },
          });
        } else if ("functionResponse" in part) {
          content.push({
            type: "tool-result",
            toolCallId: part.functionResponse.id ?? part.functionResponse.name,
            toolName: part.functionResponse.name,
            output: { type: "json", value: JSON.stringify(part.functionResponse.response) },
          });
        } else if ("executableCode" in part) {
          content.push({ type: "text", text: part.executableCode.code });
        } else if ("codeExecutionResult" in part) {
          content.push({
            type: "text",
            text: `[${part.codeExecutionResult.outcome}]\n${part.codeExecutionResult.output ?? ""}`,
          });
        }
      }

      // Map Gemini roles to playground roles:
      // - "model" → "assistant"
      // - "system" → "system"
      // - "user" (or unset) → "user"
      let role: Message["role"];
      if (message.role === "model") {
        role = "assistant";
      } else if (message.role === "system") {
        role = "system";
      } else {
        role = "user";
      }

      return { role, content };
    })
  );
};
