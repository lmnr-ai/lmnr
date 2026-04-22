import { z } from "zod/v4";

/**
 * Schemas for the OpenAI Responses API request/response formats.
 *
 * See: https://platform.openai.com/docs/api-reference/responses
 *
 * The Responses API uses a flat list of "items" (a.k.a. outputs or inputs),
 * where each item has a `type` discriminator. Messages are wrapped in an
 * item with `type: "message"`, tool invocations become items with types
 * like `function_call`, `web_search_call`, `file_search_call`,
 * `computer_call`, etc., and tool results become `*_call_output` items.
 */

/** Input content parts (sent by the user/system) **/

export const OpenAIResponsesInputTextPartSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

export const OpenAIResponsesInputImagePartSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string().nullable().optional(),
  file_id: z.string().nullable().optional(),
  detail: z.enum(["low", "high", "auto"]).nullable().optional(),
});

export const OpenAIResponsesInputFilePartSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string().nullable().optional(),
  file_id: z.string().nullable().optional(),
  file_url: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
});

/** Output content parts (produced by the model) **/

export const OpenAIResponsesOutputTextPartSchema = z
  .object({
    type: z.literal("output_text"),
    text: z.string(),
    annotations: z.array(z.unknown()).nullable().optional(),
    logprobs: z.array(z.unknown()).nullable().optional(),
  })
  .loose();

export const OpenAIResponsesRefusalPartSchema = z.object({
  type: z.literal("refusal"),
  refusal: z.string(),
});

export const OpenAIResponsesContentPartSchema = z.union([
  OpenAIResponsesInputTextPartSchema,
  OpenAIResponsesInputImagePartSchema,
  OpenAIResponsesInputFilePartSchema,
  OpenAIResponsesOutputTextPartSchema,
  OpenAIResponsesRefusalPartSchema,
]);

/** Message item **/

export const OpenAIResponsesMessageItemSchema = z
  .object({
    type: z.literal("message").optional(),
    role: z.enum(["user", "assistant", "system", "developer"]),
    content: z.union([z.string(), z.array(OpenAIResponsesContentPartSchema)]),
    id: z.string().optional(),
    status: z.string().nullable().optional(),
  })
  .loose();

/** Reasoning item **/

export const OpenAIResponsesReasoningSummarySchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

export const OpenAIResponsesReasoningContentSchema = z
  .object({
    type: z.union([z.literal("reasoning_text"), z.string()]),
    text: z.string().optional(),
  })
  .loose();

export const OpenAIResponsesReasoningItemSchema = z
  .object({
    type: z.literal("reasoning"),
    id: z.string().optional(),
    summary: z.array(OpenAIResponsesReasoningSummarySchema).nullable().optional(),
    content: z.array(OpenAIResponsesReasoningContentSchema).nullable().optional(),
    encrypted_content: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .loose();

/** Function call / output items **/

export const OpenAIResponsesFunctionCallItemSchema = z
  .object({
    type: z.literal("function_call"),
    id: z.string().optional(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesFunctionCallOutputItemSchema = z
  .object({
    type: z.literal("function_call_output"),
    id: z.string().optional(),
    call_id: z.string(),
    output: z.union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
    status: z.string().nullable().optional(),
  })
  .loose();

/** Hosted tool items (OpenAI-managed) **/

export const OpenAIResponsesWebSearchCallItemSchema = z
  .object({
    type: z.literal("web_search_call"),
    id: z.string(),
    status: z.string().nullable().optional(),
    action: z.unknown().optional(),
  })
  .loose();

export const OpenAIResponsesFileSearchCallItemSchema = z
  .object({
    type: z.literal("file_search_call"),
    id: z.string(),
    status: z.string().nullable().optional(),
    queries: z.array(z.string()).nullable().optional(),
    results: z.array(z.unknown()).nullable().optional(),
  })
  .loose();

export const OpenAIResponsesComputerCallItemSchema = z
  .object({
    type: z.literal("computer_call"),
    id: z.string().optional(),
    call_id: z.string(),
    action: z.unknown(),
    pending_safety_checks: z.array(z.unknown()).nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesComputerCallOutputItemSchema = z
  .object({
    type: z.literal("computer_call_output"),
    id: z.string().optional(),
    call_id: z.string(),
    output: z.unknown(),
    acknowledged_safety_checks: z.array(z.unknown()).nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesImageGenerationCallItemSchema = z
  .object({
    type: z.literal("image_generation_call"),
    id: z.string(),
    status: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    output_format: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesCodeInterpreterCallItemSchema = z
  .object({
    type: z.literal("code_interpreter_call"),
    id: z.string(),
    code: z.string().nullable().optional(),
    container_id: z.string().nullable().optional(),
    outputs: z.array(z.unknown()).nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesLocalShellCallItemSchema = z
  .object({
    type: z.literal("local_shell_call"),
    id: z.string().optional(),
    call_id: z.string(),
    action: z.unknown(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesLocalShellCallOutputItemSchema = z
  .object({
    type: z.literal("local_shell_call_output"),
    id: z.string().optional(),
    call_id: z.string().optional(),
    output: z.unknown(),
    status: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesMCPCallItemSchema = z
  .object({
    type: z.literal("mcp_call"),
    id: z.string(),
    server_label: z.string().optional(),
    name: z.string().optional(),
    arguments: z.string().optional(),
    output: z.unknown().optional(),
    error: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesMCPListToolsItemSchema = z
  .object({
    type: z.literal("mcp_list_tools"),
    id: z.string(),
    server_label: z.string().optional(),
    tools: z.array(z.unknown()).optional(),
  })
  .loose();

export const OpenAIResponsesMCPApprovalRequestItemSchema = z
  .object({
    type: z.literal("mcp_approval_request"),
    id: z.string(),
    server_label: z.string().optional(),
    name: z.string().optional(),
    arguments: z.string().optional(),
  })
  .loose();

export const OpenAIResponsesMCPApprovalResponseItemSchema = z
  .object({
    type: z.literal("mcp_approval_response"),
    id: z.string().optional(),
    approval_request_id: z.string(),
    approve: z.boolean(),
    reason: z.string().nullable().optional(),
  })
  .loose();

export const OpenAIResponsesItemReferenceSchema = z
  .object({
    type: z.literal("item_reference"),
    id: z.string(),
  })
  .loose();

/** Union of all items. Using discriminated union is not viable because the
 * API may introduce new item types; fallback to a permissive union. */

export const OpenAIResponsesItemSchema = z.union([
  OpenAIResponsesMessageItemSchema,
  OpenAIResponsesReasoningItemSchema,
  OpenAIResponsesFunctionCallItemSchema,
  OpenAIResponsesFunctionCallOutputItemSchema,
  OpenAIResponsesWebSearchCallItemSchema,
  OpenAIResponsesFileSearchCallItemSchema,
  OpenAIResponsesComputerCallItemSchema,
  OpenAIResponsesComputerCallOutputItemSchema,
  OpenAIResponsesImageGenerationCallItemSchema,
  OpenAIResponsesCodeInterpreterCallItemSchema,
  OpenAIResponsesLocalShellCallItemSchema,
  OpenAIResponsesLocalShellCallOutputItemSchema,
  OpenAIResponsesMCPCallItemSchema,
  OpenAIResponsesMCPListToolsItemSchema,
  OpenAIResponsesMCPApprovalRequestItemSchema,
  OpenAIResponsesMCPApprovalResponseItemSchema,
  OpenAIResponsesItemReferenceSchema,
]);

export const OpenAIResponsesItemsSchema = z.array(OpenAIResponsesItemSchema);

/** Full Response object (`object: "response"`). */
export const OpenAIResponsesResponseSchema = z
  .object({
    object: z.literal("response").optional(),
    id: z.string().optional(),
    output: z.array(OpenAIResponsesItemSchema),
  })
  .loose();

export type OpenAIResponsesItem = z.infer<typeof OpenAIResponsesItemSchema>;
export type OpenAIResponsesMessageItem = z.infer<typeof OpenAIResponsesMessageItemSchema>;

/** Item types that are distinctive to the Responses API. Used for detection
 * so the parser isn't triggered by generic shapes that also validate as
 * single messages. */
const RESPONSES_DISTINCTIVE_ITEM_TYPES = new Set([
  "reasoning",
  "function_call",
  "function_call_output",
  "web_search_call",
  "file_search_call",
  "computer_call",
  "computer_call_output",
  "image_generation_call",
  "code_interpreter_call",
  "local_shell_call",
  "local_shell_call_output",
  "mcp_call",
  "mcp_list_tools",
  "mcp_approval_request",
  "mcp_approval_response",
  "item_reference",
]);

const RESPONSES_DISTINCTIVE_CONTENT_TYPES = new Set([
  "input_text",
  "input_image",
  "input_file",
  "output_text",
  "refusal",
]);

const hasResponsesContentParts = (content: unknown): boolean => {
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) => typeof part === "object" && part !== null && RESPONSES_DISTINCTIVE_CONTENT_TYPES.has((part as any).type)
  );
};

/** Does the payload look like Responses-API items? */
export const hasOpenAIResponsesSignals = (data: unknown): boolean => {
  const items = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as any).output)
      ? (data as any).output
      : data && typeof data === "object"
        ? [data]
        : [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const t = (item as any).type;
    if (typeof t === "string" && RESPONSES_DISTINCTIVE_ITEM_TYPES.has(t)) return true;
    if (t === "message" && hasResponsesContentParts((item as any).content)) return true;
    // Items without an explicit `type` but with Responses-style content parts.
    if (!t && hasResponsesContentParts((item as any).content)) return true;
  }
  return false;
};

/** Parse input: accepts a plain string, a single item, or an array of items. */
export const parseOpenAIResponsesInput = (data: unknown): z.infer<typeof OpenAIResponsesItemsSchema> | null => {
  if (typeof data === "string") {
    return [{ type: "message", role: "user", content: data }];
  }

  if (Array.isArray(data)) {
    const result = OpenAIResponsesItemsSchema.safeParse(data);
    if (result.success) return result.data;
    return null;
  }

  if (typeof data === "object" && data !== null) {
    const single = OpenAIResponsesItemSchema.safeParse(data);
    if (single.success) return [single.data];
  }

  return null;
};

/** Parse output: accepts the full Response object, an array of items, or a single item. */
export const parseOpenAIResponsesOutput = (data: unknown): z.infer<typeof OpenAIResponsesItemsSchema> | null => {
  if (typeof data === "object" && data !== null && !Array.isArray(data) && Array.isArray((data as any).output)) {
    const result = OpenAIResponsesResponseSchema.safeParse(data);
    if (result.success) return result.data.output;
  }

  return parseOpenAIResponsesInput(data);
};
