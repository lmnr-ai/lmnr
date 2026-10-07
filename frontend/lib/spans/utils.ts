import { type Message } from "@/lib/playground/types";
import { convertToPlaygroundMessages, normalizeToMessages } from "@/lib/spans/types";
import { convertAiSdkToPlaygroundMessages, matchAiSdkMessages } from "@/lib/spans/types/ai-sdk";
import {
  convertAnthropicToPlaygroundMessages,
  parseAnthropicInput,
  parseAnthropicOutput,
} from "@/lib/spans/types/anthropic";
import { convertGeminiToPlaygroundMessages, parseGeminiInput, parseGeminiOutput } from "@/lib/spans/types/gemini";
import {
  convertLangChainToPlaygroundMessages,
  LangChainMessageSchema,
  LangChainMessagesSchema,
} from "@/lib/spans/types/langchain";
import { convertOpenAIToPlaygroundMessages, parseOpenAIInput, parseOpenAIOutput } from "@/lib/spans/types/openai";

/**
 * Prepares a span payload for export to a dataset or labeling queue: coerces it
 * to whichever provider message shape parses, so a single message object comes
 * out as an array. Falls through to the payload as-is when nothing matches.
 */
export const normalizeSpanForExport = (messages: any): unknown => {
  const openAIOutput = parseOpenAIOutput(messages);
  if (openAIOutput) {
    return openAIOutput;
  }

  const openAIInput = parseOpenAIInput(messages);
  if (openAIInput) {
    return openAIInput;
  }

  const langChainMessageResult = LangChainMessageSchema.safeParse(messages);
  if (langChainMessageResult.success) {
    return [langChainMessageResult.data];
  }

  const langChainMessagesResult = LangChainMessagesSchema.safeParse(messages);
  if (langChainMessagesResult.success) {
    return langChainMessagesResult.data;
  }

  return messages;
};

/**
 * This function essentially converts span to playground
 */
export const convertSpanToPlayground = async (messages: any): Promise<Message[]> => {
  // Verbatim AI SDK messages (LAM-1922) are `{role, content}`-shaped; wrap
  // loose shapes (single message object / bare parts array) and match them
  // BEFORE the loose OpenAI schemas, same normalization + ordering as
  // `processMessages`.
  const aiSdkMessages = matchAiSdkMessages(normalizeToMessages(messages));
  if (aiSdkMessages) {
    return await convertAiSdkToPlaygroundMessages(aiSdkMessages);
  }

  const openaiOutput = parseOpenAIOutput(messages);
  if (openaiOutput) {
    return await convertOpenAIToPlaygroundMessages(openaiOutput);
  }

  const openaiInput = parseOpenAIInput(messages);
  if (openaiInput) {
    return await convertOpenAIToPlaygroundMessages(openaiInput);
  }

  const langChainMessageResult = LangChainMessageSchema.safeParse(messages);
  const langChainMessagesResult = LangChainMessagesSchema.safeParse(messages);

  if (langChainMessageResult.success) {
    return await convertLangChainToPlaygroundMessages([langChainMessageResult.data]);
  }

  if (langChainMessagesResult.success) {
    return await convertLangChainToPlaygroundMessages(langChainMessagesResult.data);
  }

  const anthropicOutput = parseAnthropicOutput(messages);
  if (anthropicOutput) {
    return await convertAnthropicToPlaygroundMessages(anthropicOutput);
  }

  const anthropicInput = parseAnthropicInput(messages);
  if (anthropicInput) {
    return await convertAnthropicToPlaygroundMessages(anthropicInput);
  }

  const geminiOutput = parseGeminiOutput(messages);
  if (geminiOutput) {
    return await convertGeminiToPlaygroundMessages(geminiOutput);
  }

  const geminiInput = parseGeminiInput(messages);
  if (geminiInput) {
    return await convertGeminiToPlaygroundMessages(geminiInput);
  }

  return await convertToPlaygroundMessages(messages);
};
