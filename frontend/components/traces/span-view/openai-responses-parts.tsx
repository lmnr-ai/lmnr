import React, { memo } from "react";
import { type z } from "zod/v4";

import {
  type OpenAIResponsesCodeInterpreterCallItemSchema,
  type OpenAIResponsesComputerCallItemSchema,
  type OpenAIResponsesComputerCallOutputItemSchema,
  type OpenAIResponsesFileSearchCallItemSchema,
  type OpenAIResponsesFunctionCallItemSchema,
  type OpenAIResponsesFunctionCallOutputItemSchema,
  type OpenAIResponsesImageGenerationCallItemSchema,
  type OpenAIResponsesItemSchema,
  type OpenAIResponsesLocalShellCallItemSchema,
  type OpenAIResponsesLocalShellCallOutputItemSchema,
  type OpenAIResponsesMCPApprovalRequestItemSchema,
  type OpenAIResponsesMCPApprovalResponseItemSchema,
  type OpenAIResponsesMCPCallItemSchema,
  type OpenAIResponsesMCPListToolsItemSchema,
  type OpenAIResponsesMessageItemSchema,
  type OpenAIResponsesReasoningItemSchema,
  type OpenAIResponsesWebSearchCallItemSchema,
} from "@/lib/spans/types/openai-responses";

import {
  FileContentPart,
  ImageContentPart,
  TextContentPart,
  ThinkingContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "./common";

type Item = z.infer<typeof OpenAIResponsesItemSchema>;

const MessageItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesMessageItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  if (typeof item.content === "string") {
    return (
      <TextContentPart
        content={item.content}
        presetKey={`${messageIndex}-text-0-${presetKey}`}
        messageIndex={messageIndex}
        contentPartIndex={0}
      />
    );
  }

  return (
    <>
      {item.content.map((part, index) => {
        const k = `${messageIndex}-part-${index}-${presetKey}`;
        switch (part.type) {
          case "input_text":
          case "output_text":
            return (
              <TextContentPart
                key={k}
                content={part.text}
                presetKey={k}
                messageIndex={messageIndex}
                contentPartIndex={index}
              />
            );
          case "refusal":
            return (
              <TextContentPart
                key={k}
                content={`[Refusal] ${part.refusal}`}
                presetKey={k}
                messageIndex={messageIndex}
                contentPartIndex={index}
              />
            );
          case "input_image": {
            const url = part.image_url ?? part.file_id;
            if (!url) return null;
            return <ImageContentPart key={k} src={url} />;
          }
          case "input_file": {
            const data = part.file_data ?? part.file_url ?? part.file_id;
            if (!data) return null;
            return <FileContentPart key={k} data={data} filename={part.filename ?? undefined} />;
          }
          default:
            return null;
        }
      })}
    </>
  );
};

const ReasoningItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesReasoningItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  const summaryText = (item.summary ?? [])
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");
  const contentText = (item.content ?? [])
    .map((c) => c.text ?? "")
    .filter(Boolean)
    .join("\n\n");
  const combined = [summaryText, contentText].filter(Boolean).join("\n\n");
  const body = combined || (item.encrypted_content ? "[Encrypted reasoning]" : "[Reasoning]");

  return (
    <ThinkingContentPart
      content={body}
      label="Reasoning"
      presetKey={`${messageIndex}-reasoning-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
  );
};

const FunctionCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesFunctionCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  let parsedArgs: unknown = item.arguments;
  try {
    parsedArgs = JSON.parse(item.arguments);
  } catch {
    // Keep the raw string if it isn't valid JSON.
  }
  return (
    <ToolCallContentPart
      toolName={item.name}
      toolCallId={item.call_id}
      content={parsedArgs ?? {}}
      presetKey={`${messageIndex}-fn-call-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
  );
};

const FunctionCallOutputItem = ({
  item,
  presetKey,
  messageIndex,
  toolNameMap,
}: {
  item: z.infer<typeof OpenAIResponsesFunctionCallOutputItemSchema>;
  presetKey: string;
  messageIndex: number;
  toolNameMap?: Map<string, string>;
}) => {
  const content = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? "", null, 2);
  return (
    <ToolResultContentPart
      toolCallId={item.call_id}
      toolName={toolNameMap?.get(item.call_id)}
      content={content}
      presetKey={`${messageIndex}-fn-out-${presetKey}`}
    />
  );
};

const WebSearchCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesWebSearchCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <ToolCallContentPart
    toolName="web_search"
    toolCallId={item.id}
    content={{ action: item.action ?? null, status: item.status ?? null }}
    presetKey={`${messageIndex}-web-search-${presetKey}`}
    messageIndex={messageIndex}
    contentPartIndex={0}
  />
);

const FileSearchCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesFileSearchCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <>
    <ToolCallContentPart
      toolName="file_search"
      toolCallId={item.id}
      content={{ queries: item.queries ?? [], status: item.status ?? null }}
      presetKey={`${messageIndex}-file-search-call-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
    {item.results && item.results.length > 0 ? (
      <ToolResultContentPart
        toolCallId={item.id}
        toolName="file_search"
        content={JSON.stringify(item.results, null, 2)}
        presetKey={`${messageIndex}-file-search-result-${presetKey}`}
      />
    ) : null}
  </>
);

const ComputerCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesComputerCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <ToolCallContentPart
    toolName="computer_use"
    toolCallId={item.call_id}
    content={{ action: item.action, pending_safety_checks: item.pending_safety_checks ?? null }}
    presetKey={`${messageIndex}-computer-call-${presetKey}`}
    messageIndex={messageIndex}
    contentPartIndex={0}
  />
);

const ComputerCallOutputItem = ({
  item,
  presetKey,
  messageIndex,
  toolNameMap,
}: {
  item: z.infer<typeof OpenAIResponsesComputerCallOutputItemSchema>;
  presetKey: string;
  messageIndex: number;
  toolNameMap?: Map<string, string>;
}) => {
  const output = item.output as { type?: string; image_url?: string; file_id?: string } | unknown;
  if (typeof output === "object" && output !== null) {
    const typed = output as { type?: string; image_url?: string; file_id?: string };
    if (typed.type === "computer_screenshot" || typed.type === "input_image") {
      if (typed.image_url) {
        return (
          <ToolResultContentPart
            toolCallId={item.call_id}
            toolName={toolNameMap?.get(item.call_id) ?? "computer_use"}
            content=""
            presetKey={`${messageIndex}-computer-out-${presetKey}`}
          >
            <ImageContentPart src={typed.image_url} />
          </ToolResultContentPart>
        );
      }
      if (typed.file_id) {
        return (
          <ToolResultContentPart
            toolCallId={item.call_id}
            toolName={toolNameMap?.get(item.call_id) ?? "computer_use"}
            content={`[Image file: ${typed.file_id}]`}
            presetKey={`${messageIndex}-computer-out-${presetKey}`}
          />
        );
      }
    }
  }
  const content = typeof output === "string" ? output : JSON.stringify(output ?? "", null, 2);
  return (
    <ToolResultContentPart
      toolCallId={item.call_id}
      toolName={toolNameMap?.get(item.call_id) ?? "computer_use"}
      content={content}
      presetKey={`${messageIndex}-computer-out-${presetKey}`}
    />
  );
};

const ImageGenerationCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesImageGenerationCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <>
    <ToolCallContentPart
      toolName="image_generation"
      toolCallId={item.id}
      content={{ status: item.status ?? null, output_format: item.output_format ?? null }}
      presetKey={`${messageIndex}-image-gen-call-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
    {item.result ? (
      <ImageContentPart
        src={
          item.result.startsWith("data:") || item.result.startsWith("http")
            ? item.result
            : `data:image/${item.output_format || "png"};base64,${item.result}`
        }
      />
    ) : null}
  </>
);

const CodeInterpreterCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesCodeInterpreterCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <>
    <ToolCallContentPart
      toolName="code_interpreter"
      toolCallId={item.id}
      content={{ code: item.code ?? "", container_id: item.container_id ?? null, status: item.status ?? null }}
      presetKey={`${messageIndex}-code-call-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
    {item.outputs && item.outputs.length > 0 ? (
      <ToolResultContentPart
        toolCallId={item.id}
        toolName="code_interpreter"
        content={JSON.stringify(item.outputs, null, 2)}
        presetKey={`${messageIndex}-code-result-${presetKey}`}
      />
    ) : null}
  </>
);

const LocalShellCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesLocalShellCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <ToolCallContentPart
    toolName="local_shell"
    toolCallId={item.call_id}
    content={{ action: item.action, status: item.status ?? null }}
    presetKey={`${messageIndex}-shell-call-${presetKey}`}
    messageIndex={messageIndex}
    contentPartIndex={0}
  />
);

const LocalShellCallOutputItem = ({
  item,
  presetKey,
  messageIndex,
  toolNameMap,
}: {
  item: z.infer<typeof OpenAIResponsesLocalShellCallOutputItemSchema>;
  presetKey: string;
  messageIndex: number;
  toolNameMap?: Map<string, string>;
}) => (
  <ToolResultContentPart
    toolCallId={item.id}
    toolName={toolNameMap?.get(item.id) ?? "local_shell"}
    content={item.output}
    presetKey={`${messageIndex}-shell-out-${presetKey}`}
  />
);

const MCPCallItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesMCPCallItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  let parsedArgs: unknown = item.arguments;
  if (item.arguments) {
    try {
      parsedArgs = JSON.parse(item.arguments);
    } catch {
      // keep raw string
    }
  }
  const name = item.server_label && item.name ? `${item.server_label}.${item.name}` : (item.name ?? "mcp_call");
  return (
    <>
      <ToolCallContentPart
        toolName={name}
        toolCallId={item.id}
        content={parsedArgs ?? {}}
        presetKey={`${messageIndex}-mcp-call-${presetKey}`}
        messageIndex={messageIndex}
        contentPartIndex={0}
      />
      {item.output !== undefined || item.error ? (
        <ToolResultContentPart
          toolCallId={item.id}
          toolName={name}
          content={
            item.error
              ? `[Error] ${item.error}`
              : typeof item.output === "string"
                ? item.output
                : JSON.stringify(item.output ?? "", null, 2)
          }
          presetKey={`${messageIndex}-mcp-out-${presetKey}`}
        />
      ) : null}
    </>
  );
};

const MCPListToolsItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesMCPListToolsItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  const name = item.server_label ? `${item.server_label}.list_tools` : "mcp_list_tools";
  return (
    <ToolCallContentPart
      toolName={name}
      toolCallId={item.id}
      content={{ tools: item.tools ?? [] }}
      presetKey={`${messageIndex}-mcp-list-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
  );
};

const MCPApprovalRequestItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesMCPApprovalRequestItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => {
  let parsedArgs: unknown = item.arguments;
  if (item.arguments) {
    try {
      parsedArgs = JSON.parse(item.arguments);
    } catch {
      // keep raw string
    }
  }
  const name =
    item.server_label && item.name ? `${item.server_label}.${item.name}` : (item.name ?? "mcp_approval_request");
  return (
    <ToolCallContentPart
      toolName={name}
      toolCallId={item.id}
      content={{ approval_request: parsedArgs ?? {} }}
      presetKey={`${messageIndex}-mcp-approval-req-${presetKey}`}
      messageIndex={messageIndex}
      contentPartIndex={0}
    />
  );
};

const MCPApprovalResponseItem = ({
  item,
  presetKey,
  messageIndex,
}: {
  item: z.infer<typeof OpenAIResponsesMCPApprovalResponseItemSchema>;
  presetKey: string;
  messageIndex: number;
}) => (
  <ToolResultContentPart
    toolCallId={item.approval_request_id}
    toolName="mcp_approval_response"
    content={JSON.stringify({ approve: item.approve, reason: item.reason ?? null }, null, 2)}
    presetKey={`${messageIndex}-mcp-approval-res-${presetKey}`}
  />
);

const PureOpenAIResponsesContentParts = ({
  message,
  parentIndex,
  presetKey,
  toolNameMap,
}: {
  message: Item;
  parentIndex: number;
  presetKey: string;
  toolNameMap?: Map<string, string>;
}) => {
  switch (message.type) {
    case "message":
    case undefined:
      return (
        <MessageItem
          item={message as z.infer<typeof OpenAIResponsesMessageItemSchema>}
          presetKey={presetKey}
          messageIndex={parentIndex}
        />
      );
    case "reasoning":
      return <ReasoningItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "function_call":
      return <FunctionCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "function_call_output":
      return (
        <FunctionCallOutputItem
          item={message}
          presetKey={presetKey}
          messageIndex={parentIndex}
          toolNameMap={toolNameMap}
        />
      );
    case "web_search_call":
      return <WebSearchCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "file_search_call":
      return <FileSearchCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "computer_call":
      return <ComputerCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "computer_call_output":
      return (
        <ComputerCallOutputItem
          item={message}
          presetKey={presetKey}
          messageIndex={parentIndex}
          toolNameMap={toolNameMap}
        />
      );
    case "image_generation_call":
      return <ImageGenerationCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "code_interpreter_call":
      return <CodeInterpreterCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "local_shell_call":
      return <LocalShellCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "local_shell_call_output":
      return (
        <LocalShellCallOutputItem
          item={message}
          presetKey={presetKey}
          messageIndex={parentIndex}
          toolNameMap={toolNameMap}
        />
      );
    case "mcp_call":
      return <MCPCallItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "mcp_list_tools":
      return <MCPListToolsItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "mcp_approval_request":
      return <MCPApprovalRequestItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "mcp_approval_response":
      return <MCPApprovalResponseItem item={message} presetKey={presetKey} messageIndex={parentIndex} />;
    case "item_reference":
      return (
        <TextContentPart
          content={`[Item reference: ${message.id}]`}
          presetKey={`${parentIndex}-itemref-${presetKey}`}
          messageIndex={parentIndex}
          contentPartIndex={0}
        />
      );
    default:
      return null;
  }
};

const OpenAIResponsesContentParts = memo(PureOpenAIResponsesContentParts);
export default OpenAIResponsesContentParts;
