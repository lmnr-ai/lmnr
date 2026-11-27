import AnthropicContentParts from "@/components/traces/span-view/anthropic-parts";
import GeminiContentParts from "@/components/traces/span-view/gemini-parts";
import ContentParts from "@/components/traces/span-view/generic-parts";
import LangChainContentParts from "@/components/traces/span-view/langchain-parts";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import OpenAIResponsesContentParts from "@/components/traces/span-view/openai-responses-parts";
import { type ProcessedMessages } from "@/lib/spans/process-messages";

export function buildToolNameMap(result: ProcessedMessages): Map<string, string> {
  const map = new Map<string, string>();
  switch (result.type) {
    case "openai":
      for (const msg of result.messages) {
        if (msg.role === "assistant" && msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            map.set(tc.id, tc.function.name);
          }
        }
      }
      break;
    case "openai-responses":
      for (const item of result.messages) {
        switch (item.type) {
          case "function_call":
            map.set(item.call_id, item.name);
            break;
          case "computer_call":
            map.set(item.call_id, "computer_use");
            break;
          case "local_shell_call":
            // local_shell_call_output has no call_id in the API — its `id` field
            // references the call's `call_id`. Register both to be resilient to
            // either convention.
            map.set(item.call_id, "local_shell");
            map.set(item.id, "local_shell");
            break;
          case "mcp_call":
            map.set(
              item.id,
              item.server_label && item.name ? `${item.server_label}.${item.name}` : (item.name ?? "mcp_call")
            );
            break;
          case "web_search_call":
            map.set(item.id, "web_search");
            break;
          case "file_search_call":
            map.set(item.id, "file_search");
            break;
          case "image_generation_call":
            map.set(item.id, "image_generation");
            break;
          case "code_interpreter_call":
            map.set(item.id, "code_interpreter");
            break;
          case "mcp_approval_request":
            map.set(
              item.id,
              item.server_label && item.name
                ? `${item.server_label}.${item.name}`
                : (item.name ?? "mcp_approval_request")
            );
            break;
          case "custom_tool_call":
            map.set(item.call_id, item.name);
            break;
        }
      }
      break;
    case "anthropic":
      for (const msg of result.messages) {
        if (typeof msg.content !== "string") {
          for (const block of msg.content) {
            if ((block.type === "tool_use" || block.type === "server_tool_use") && "id" in block && "name" in block) {
              map.set(block.id, block.name);
            }
          }
        }
      }
      break;
    case "langchain":
      for (const msg of result.messages) {
        if ((msg.role === "assistant" || msg.role === "ai") && "tool_calls" in msg) {
          for (const tc of msg.tool_calls || []) {
            if (tc.id) {
              map.set(tc.id, tc.name);
            }
          }
        }
      }
      break;
  }
  return map;
}

// `index` locates the message within `result`; `parentIndex` is its position in the rendered list, which
// differs when several segments are concatenated (span turn) and keys per-part presets and search order.
export function renderMessageContent(
  result: ProcessedMessages,
  index: number,
  parentIndex: number,
  presetKey: string,
  toolNameMap?: Map<string, string>
) {
  const map = toolNameMap ?? buildToolNameMap(result);
  switch (result.type) {
    case "openai":
      return (
        <OpenAIContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "openai-responses":
      return (
        <OpenAIResponsesContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "anthropic":
      return (
        <AnthropicContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "langchain":
      return (
        <LangChainContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "gemini":
      return <GeminiContentParts parentIndex={parentIndex} presetKey={presetKey} message={result.messages[index]} />;
    case "generic":
      return <ContentParts parentIndex={parentIndex} presetKey={presetKey} message={result.messages[index]} />;
  }
}
