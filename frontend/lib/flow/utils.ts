import { ChatMessage, ChatMessageContentPart } from '../types';
import { isStringType } from '../utils';

export type NodeInput =
  | string
  | string[]
  | ChatMessage[]
  | number;

export function isStringList(input: NodeInput): input is string[] {
  if (input === undefined) return false;
  if (!Array.isArray(input)) return false;
  return input.every((item) => typeof item === 'string');
}

export function isChatMessageList(input: NodeInput): input is ChatMessage[] {
  if (input === undefined) return false;
  if (!Array.isArray(input)) return false;
  return input.every(
    (item) =>
      // Check for !== null first, because typeof null is 'object'
      item !== null &&
      typeof item === 'object' &&
      'role' in item &&
      'content' in item
  );
}

export const renderChatMessageContentParts = (
  parts: ChatMessageContentPart[]
): string =>
  parts
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      } else if (part.type === 'image_url') {
        return part.url;
      } else if (part.type === 'image') {
        let data;
        if (part.data.length <= 30) {
          data = part.data;
        } else {
          const firstPart = part.data.slice(0, 10);
          const lastPart = part.data.slice(-10);
          data = `${firstPart}...${lastPart}`;
        }
        return `Image\nMedia type: ${part.mediaType}\nData: ${data}`;
      } else if (part.type === 'document_url') {
        return `Document\nMedia type: ${part.mediaType}\nUri: ${part.url}`;
      }
    })
    .join('\n\n');

/**
 * Render the node input as a string for display in the UI.
 *
 * IMPORTANT: It must first check for isStringList before isChatMessageList.
 * Because if empty array is passed, we want it to be treated as string list and rendered as "[]".
 */
export const renderNodeInput = (input: NodeInput): string => {
  if (typeof input === 'string') {
    return input as string;
  } else if (isStringList(input)) {
    return JSON.stringify(input, null, 2); // `[\n  ${(input as string[]).join(',\n  ')}\n]`
  } else if (isChatMessageList(input)) {
    return renderChatMessageList(input);
  } else {
    return JSON.stringify(input, null, 2);
  }
};

export const renderChatMessageList = (messages: ChatMessage[]): string =>
  messages
    .map((message) => {
      let tag = message.role;

      if (isStringType(message.content)) {
        return `<${tag}>\n${message.content}\n</${tag}>\n`;
      } else {
        return `<${tag}>\n${renderChatMessageContentParts(message.content)}\n</${tag}>\n`;
      }
    })
    .join('\n\n');

export const getDurationString = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const duration = end.getTime() - start.getTime();

  return `${(duration / 1000).toFixed(2)}s`;
};

export const getDuration = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return end.getTime() - start.getTime();
};
