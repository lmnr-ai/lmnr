import { type Message } from "@/lib/playground/types";
import { convertToPlaygroundMessages, downloadImages } from "@/lib/spans/types";
import {
  convertAnthropicToPlaygroundMessages,
  parseAnthropicInput,
  parseAnthropicOutput,
} from "@/lib/spans/types/anthropic";
import { convertGeminiToPlaygroundMessages, parseGeminiInput, parseGeminiOutput } from "@/lib/spans/types/gemini";
import {
  convertLangChainToPlaygroundMessages,
  downloadLangChainImages,
  LangChainMessageSchema,
  LangChainMessagesSchema,
} from "@/lib/spans/types/langchain";
import {
  convertOpenAIToPlaygroundMessages,
  downloadOpenAIImages,
  parseOpenAIInput,
  parseOpenAIOutput,
} from "@/lib/spans/types/openai";

/**
 * This function essentially prepares span for export
 * downloading necessary image parts
 */
export const downloadSpanImages = async (messages: any): Promise<unknown> => {
  const openAIOutput = parseOpenAIOutput(messages);
  if (openAIOutput) {
    return await downloadOpenAIImages(openAIOutput);
  }

  const openAIInput = parseOpenAIInput(messages);
  if (openAIInput) {
    return await downloadOpenAIImages(openAIInput);
  }

  const langChainMessageResult = LangChainMessageSchema.safeParse(messages);
  const langChainMessagesResult = LangChainMessagesSchema.safeParse(messages);

  if (langChainMessageResult.success) {
    return await downloadLangChainImages([langChainMessageResult.data]);
  }

  if (langChainMessagesResult.success) {
    return await downloadLangChainImages(langChainMessagesResult.data);
  }

  return await downloadImages(messages);
};

/**
 * This function essentially converts span to playground
 * downloading necessary image parts
 */
export const convertSpanToPlayground = async (messages: any): Promise<Message[]> => {
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
