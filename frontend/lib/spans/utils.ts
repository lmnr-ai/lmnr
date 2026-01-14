import { type Message } from "@/lib/playground/types";
import { convertToPlaygroundMessages, downloadImages } from "@/lib/spans/types";
import {
  convertLangChainToPlaygroundMessages,
  downloadLangChainImages,
  LangChainMessageSchema,
  LangChainMessagesSchema,
} from "@/lib/spans/types/langchain";
import {
  convertOpenAIToPlaygroundMessages,
  downloadOpenAIImages,
  OpenAIMessageSchema,
  OpenAIMessagesSchema,
} from "@/lib/spans/types/openai";

/**
 * This function essentially prepares span for export
 * downloading necessary image parts
 */
export const downloadSpanImages = async (messages: any): Promise<unknown> => {
  const openAIMessageResult = OpenAIMessageSchema.safeParse(messages);
  const openAIMessagesResult = OpenAIMessagesSchema.safeParse(messages);
  const langChainMessageResult = LangChainMessageSchema.safeParse(messages);
  const langChainMessagesResult = LangChainMessagesSchema.safeParse(messages);

  if (openAIMessageResult.success) {
    return await downloadOpenAIImages([openAIMessageResult.data]);
  }

  if (openAIMessagesResult.success) {
    return await downloadOpenAIImages(openAIMessagesResult.data);
  }

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
  const openAIMessageResult = OpenAIMessageSchema.safeParse(messages);
  const openAIMessagesResult = OpenAIMessagesSchema.safeParse(messages);
  const langChainMessageResult = LangChainMessageSchema.safeParse(messages);
  const langChainMessagesResult = LangChainMessagesSchema.safeParse(messages);

  if (openAIMessageResult.success) {
    return await convertOpenAIToPlaygroundMessages([openAIMessageResult.data]);
  }

  if (openAIMessagesResult.success) {
    return await convertOpenAIToPlaygroundMessages(openAIMessagesResult.data);
  }

  if (langChainMessageResult.success) {
    return await convertLangChainToPlaygroundMessages([langChainMessageResult.data]);
  }

  if (langChainMessagesResult.success) {
    return await convertLangChainToPlaygroundMessages(langChainMessagesResult.data);
  }

  return await convertToPlaygroundMessages(messages);
};
