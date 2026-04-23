import { z } from "zod/v4";

/**
 * Schemas for the OpenAI Responses API request/response formats.
 *
 * See: https://developers.openai.com/api/reference/resources/responses/methods/create
 *
 * The Responses API uses a flat list of "items" (a.k.a. outputs or inputs),
 * where each item has a `type` discriminator. Messages are wrapped in an
 * item with `type: "message"`, tool invocations become items with types
 * like `function_call`, `web_search_call`, `file_search_call`,
 * `computer_call`, etc., and tool results become `*_call_output` items.
 *
 * Fields are modeled after the official OpenAI TypeScript types. If a new
 * field appears in the API, add it here — we deliberately do not use
 * `.loose()` so that payloads from unrelated formats cannot fall through.
 */

const StatusEnumSchema = z.enum(["in_progress", "completed", "incomplete"]);

/** Input content parts (sent by the user/system) **/

export const OpenAIResponsesInputTextPartSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

export const OpenAIResponsesInputImagePartSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string().nullish(),
  file_id: z.string().nullish(),
  detail: z.enum(["low", "high", "auto", "original"]).nullish(),
});

export const OpenAIResponsesInputFilePartSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string().nullish(),
  file_id: z.string().nullish(),
  file_url: z.string().nullish(),
  filename: z.string().nullish(),
});

/** Output content parts (produced by the model) **/

const OpenAIResponsesFileCitationSchema = z.object({
  type: z.literal("file_citation"),
  file_id: z.string(),
  filename: z.string(),
  index: z.number(),
});

const OpenAIResponsesURLCitationSchema = z.object({
  type: z.literal("url_citation"),
  end_index: z.number(),
  start_index: z.number(),
  title: z.string(),
  url: z.string(),
});

const OpenAIResponsesContainerFileCitationSchema = z.object({
  type: z.literal("container_file_citation"),
  container_id: z.string(),
  end_index: z.number(),
  file_id: z.string(),
  filename: z.string(),
  start_index: z.number(),
});

const OpenAIResponsesFilePathAnnotationSchema = z.object({
  type: z.literal("file_path"),
  file_id: z.string(),
  index: z.number(),
});

const OpenAIResponsesOutputTextAnnotationSchema = z.union([
  OpenAIResponsesFileCitationSchema,
  OpenAIResponsesURLCitationSchema,
  OpenAIResponsesContainerFileCitationSchema,
  OpenAIResponsesFilePathAnnotationSchema,
]);

const OpenAIResponsesLogprobSchema = z.object({
  token: z.string(),
  bytes: z.array(z.number()),
  logprob: z.number(),
  top_logprobs: z.array(
    z.object({
      token: z.string(),
      bytes: z.array(z.number()),
      logprob: z.number(),
    })
  ),
});

export const OpenAIResponsesOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(OpenAIResponsesOutputTextAnnotationSchema).nullish(),
  logprobs: z.array(OpenAIResponsesLogprobSchema).nullish(),
});

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

export const OpenAIResponsesMessageItemSchema = z.object({
  type: z.literal("message").optional(),
  role: z.enum(["user", "assistant", "system", "developer"]),
  content: z.union([z.string(), z.array(OpenAIResponsesContentPartSchema)]),
  id: z.string().optional(),
  status: StatusEnumSchema.nullish(),
  phase: z.enum(["commentary", "final_answer"]).nullish(),
  created_by: z.string().optional(),
});

/** Reasoning item **/

export const OpenAIResponsesReasoningSummarySchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

export const OpenAIResponsesReasoningContentSchema = z.object({
  type: z.literal("reasoning_text"),
  text: z.string(),
});

export const OpenAIResponsesReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(OpenAIResponsesReasoningSummarySchema).nullish(),
  content: z.array(OpenAIResponsesReasoningContentSchema).nullish(),
  encrypted_content: z.string().nullish(),
  status: StatusEnumSchema.nullish(),
});

/** Function call / output items **/

export const OpenAIResponsesFunctionCallItemSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  namespace: z.string().optional(),
  status: StatusEnumSchema.nullish(),
  created_by: z.string().optional(),
});

const OpenAIResponsesFunctionCallOutputContentSchema = z.union([
  OpenAIResponsesInputTextPartSchema,
  OpenAIResponsesInputImagePartSchema,
  OpenAIResponsesInputFilePartSchema,
]);

export const OpenAIResponsesFunctionCallOutputItemSchema = z.object({
  type: z.literal("function_call_output"),
  id: z.string().nullish(),
  call_id: z.string(),
  output: z.union([z.string(), z.array(OpenAIResponsesFunctionCallOutputContentSchema)]),
  status: StatusEnumSchema.nullish(),
  created_by: z.string().optional(),
});

/** Hosted tool items (OpenAI-managed) **/

const OpenAIResponsesWebSearchActionSchema = z.union([
  z.object({
    type: z.literal("search"),
    query: z.string(),
    queries: z.array(z.string()).optional(),
    sources: z
      .array(
        z.object({
          type: z.literal("url"),
          url: z.string(),
        })
      )
      .optional(),
  }),
  z.object({
    type: z.literal("open_page"),
    url: z.string().nullish(),
  }),
  z.object({
    type: z.literal("find_in_page"),
    pattern: z.string(),
    url: z.string(),
  }),
]);

export const OpenAIResponsesWebSearchCallItemSchema = z.object({
  type: z.literal("web_search_call"),
  id: z.string(),
  status: z.enum(["in_progress", "searching", "completed", "failed"]),
  action: OpenAIResponsesWebSearchActionSchema.optional(),
});

const OpenAIResponsesFileSearchResultSchema = z.object({
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullish(),
  file_id: z.string().optional(),
  filename: z.string().optional(),
  score: z.number().optional(),
  text: z.string().optional(),
});

export const OpenAIResponsesFileSearchCallItemSchema = z.object({
  type: z.literal("file_search_call"),
  id: z.string(),
  queries: z.array(z.string()),
  status: z.enum(["in_progress", "searching", "completed", "incomplete", "failed"]),
  results: z.array(OpenAIResponsesFileSearchResultSchema).nullish(),
});

const OpenAIResponsesComputerActionSchema = z.union([
  z.object({
    type: z.literal("click"),
    button: z.enum(["left", "right", "wheel", "back", "forward"]),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal("double_click"),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal("drag"),
    path: z.array(z.object({ x: z.number(), y: z.number() })),
    keys: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal("keypress"),
    keys: z.array(z.string()),
  }),
  z.object({
    type: z.literal("move"),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal("screenshot"),
  }),
  z.object({
    type: z.literal("scroll"),
    scroll_x: z.number(),
    scroll_y: z.number(),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal("type"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("wait"),
  }),
]);

const OpenAIResponsesPendingSafetyCheckSchema = z.object({
  id: z.string(),
  code: z.string().nullish(),
  message: z.string().nullish(),
});

export const OpenAIResponsesComputerCallItemSchema = z.object({
  type: z.literal("computer_call"),
  id: z.string(),
  call_id: z.string(),
  pending_safety_checks: z.array(OpenAIResponsesPendingSafetyCheckSchema),
  status: StatusEnumSchema,
  action: OpenAIResponsesComputerActionSchema.optional(),
  actions: z.array(OpenAIResponsesComputerActionSchema).optional(),
});

const OpenAIResponsesComputerScreenshotSchema = z.object({
  type: z.literal("computer_screenshot"),
  file_id: z.string().optional(),
  image_url: z.string().optional(),
});

export const OpenAIResponsesComputerCallOutputItemSchema = z.object({
  type: z.literal("computer_call_output"),
  id: z.string().nullish(),
  call_id: z.string(),
  output: OpenAIResponsesComputerScreenshotSchema,
  status: z.enum(["completed", "incomplete", "failed", "in_progress"]).nullish(),
  acknowledged_safety_checks: z.array(OpenAIResponsesPendingSafetyCheckSchema).nullish(),
  created_by: z.string().optional(),
});

export const OpenAIResponsesImageGenerationCallItemSchema = z.object({
  type: z.literal("image_generation_call"),
  id: z.string(),
  result: z.string().nullable(),
  status: z.enum(["in_progress", "completed", "generating", "failed"]),
  output_format: z.enum(["png", "webp", "jpeg"]).nullish(),
});

const OpenAIResponsesCodeInterpreterLogsOutputSchema = z.object({
  type: z.literal("logs"),
  logs: z.string(),
});

const OpenAIResponsesCodeInterpreterImageOutputSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
});

const OpenAIResponsesCodeInterpreterOutputSchema = z.union([
  OpenAIResponsesCodeInterpreterLogsOutputSchema,
  OpenAIResponsesCodeInterpreterImageOutputSchema,
]);

export const OpenAIResponsesCodeInterpreterCallItemSchema = z.object({
  type: z.literal("code_interpreter_call"),
  id: z.string(),
  code: z.string().nullable(),
  container_id: z.string(),
  outputs: z.array(OpenAIResponsesCodeInterpreterOutputSchema).nullable(),
  status: z.enum(["in_progress", "completed", "incomplete", "interpreting", "failed"]),
});

const OpenAIResponsesLocalShellActionSchema = z.object({
  type: z.literal("exec"),
  command: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  timeout_ms: z.number().nullish(),
  user: z.string().nullish(),
  working_directory: z.string().nullish(),
});

export const OpenAIResponsesLocalShellCallItemSchema = z.object({
  type: z.literal("local_shell_call"),
  id: z.string(),
  call_id: z.string(),
  action: OpenAIResponsesLocalShellActionSchema,
  status: StatusEnumSchema,
});

export const OpenAIResponsesLocalShellCallOutputItemSchema = z.object({
  type: z.literal("local_shell_call_output"),
  id: z.string(),
  output: z.string(),
  status: StatusEnumSchema.nullish(),
});

export const OpenAIResponsesMCPCallItemSchema = z.object({
  type: z.literal("mcp_call"),
  id: z.string(),
  server_label: z.string(),
  name: z.string(),
  arguments: z.string(),
  approval_request_id: z.string().nullish(),
  error: z.string().nullish(),
  output: z.string().nullish(),
  status: z.enum(["in_progress", "completed", "incomplete", "calling", "failed"]).optional(),
});

const OpenAIResponsesMCPToolSchema = z.object({
  name: z.string(),
  input_schema: z.unknown(),
  annotations: z.unknown().nullish(),
  description: z.string().nullish(),
});

export const OpenAIResponsesMCPListToolsItemSchema = z.object({
  type: z.literal("mcp_list_tools"),
  id: z.string(),
  server_label: z.string(),
  tools: z.array(OpenAIResponsesMCPToolSchema),
  error: z.string().nullish(),
});

export const OpenAIResponsesMCPApprovalRequestItemSchema = z.object({
  type: z.literal("mcp_approval_request"),
  id: z.string(),
  server_label: z.string(),
  name: z.string(),
  arguments: z.string(),
});

export const OpenAIResponsesMCPApprovalResponseItemSchema = z.object({
  type: z.literal("mcp_approval_response"),
  id: z.string().optional(),
  approval_request_id: z.string(),
  approve: z.boolean(),
  reason: z.string().nullish(),
});

export const OpenAIResponsesItemReferenceSchema = z.object({
  type: z.literal("item_reference"),
  id: z.string(),
});

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
export const OpenAIResponsesResponseSchema = z.object({
  object: z.literal("response").optional(),
  id: z.string().optional(),
  output: z.array(OpenAIResponsesItemSchema),
});

export type OpenAIResponsesItem = z.infer<typeof OpenAIResponsesItemSchema>;
export type OpenAIResponsesMessageItem = z.infer<typeof OpenAIResponsesMessageItemSchema>;

/** Parse input: accepts a single item or an array of items. */
export const parseOpenAIResponsesInput = (data: unknown): z.infer<typeof OpenAIResponsesItemsSchema> | null => {
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
