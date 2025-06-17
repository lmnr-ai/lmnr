import { Message } from "@/lib/playground/types";
import {
  convertOpenAIToPlaygroundMessages,
  convertToPlaygroundMessages,
  downloadImages,
  downloadOpenAIImages,
  OpenAIMessageSchema,
  OpenAIMessagesSchema,
} from "@/lib/spans/types";

/**
 * This function essentially prepares span for export
 * downloading necessary image parts
 */
export const downloadSpanImages = async (messages: any): Promise<any> => {
  const openAIMessageResult = OpenAIMessageSchema.safeParse(messages);
  const openAIMessagesResult = OpenAIMessagesSchema.safeParse(messages);
  if (openAIMessageResult.success) {
    return await downloadOpenAIImages([openAIMessageResult.data]);
  }

  if (openAIMessagesResult.success) {
    return await downloadOpenAIImages(openAIMessagesResult.data);
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
  if (openAIMessageResult.success) {
    return await convertOpenAIToPlaygroundMessages([openAIMessageResult.data]);
  }

  if (openAIMessagesResult.success) {
    return await convertOpenAIToPlaygroundMessages(openAIMessagesResult.data);
  }

  return await convertToPlaygroundMessages(messages);
};
