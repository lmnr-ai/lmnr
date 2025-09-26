import { CacheSpan } from "./cache";

/**
 * Represents a message in a conversation
 */
interface ChatMessage {
  role: string;
  content: any; // Can be string, object, or any JSON-serializable type
  [key: string]: any;
}

/**
 * Normalizes message content to string for comparison
 */
const normalizeMessageContent = (content: any): string => {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content) && content.length == 1 && content[0].type === "text") return content[0].text;
  return JSON.stringify(content);
};

/**
 * Checks if an input/output is a chat message array
 */
const isChatMessageArray = (data: any): data is ChatMessage[] =>
  Array.isArray(data) &&
  data.length > 0 &&
  data.every(
    (item) => typeof item === "object" && item !== null && typeof item.role === "string" && item.content !== undefined
  );

/**
 * Checks if two message arrays have a prefix relationship
 * Returns the number of matching messages from the start, or -1 if no prefix relationship
 */
const getMessagePrefixLength = (shorter: ChatMessage[], longer: ChatMessage[]): number => {
  if (shorter.length >= longer.length) return -1;

  for (let i = 0; i < shorter.length; i++) {
    if (getMessageString(shorter[i]) !== getMessageString(longer[i])) {
      return -1;
    }
  }

  return shorter.length;
};

/**
 * Creates a placeholder message for removed content
 */
const createPlaceholderMessage = (count: number): ChatMessage => ({
  role: "[PLACEHOLDER]",
  content: `[MESSAGES ARE REPLACED WITH A PLACEHOLDER BECAUSE THEY ARE REPEATED FROM PREVIOUS CONVERSATION TURNS. ${count} message${count !== 1 ? "s" : ""} omitted]`,
});

/**
 * Detects if a string contains base64 encoded image data
 */
const isBase64Image = (str: string): boolean => {
  // Check for data URL format: data:image/[type];base64,[data]
  const dataUrlPattern = /^data:image\/[a-zA-Z]+;base64,/;
  if (dataUrlPattern.test(str)) return true;

  // Check for standalone base64 that could be an image (minimum reasonable length)
  // Base64 images are typically quite long (>50 chars for even very small images)
  if (str.length < 50) return false;

  // Check if string is valid base64
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(str)) return false;

  try {
    // Try to decode and check for image magic numbers
    const decoded = atob(str);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length && i < 12; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }

    // Convert first few bytes to hex for magic number detection
    const hex = Array.from(bytes.slice(0, 12))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Check magic numbers for common image formats
    return (
      hex.startsWith("89504e47") || // PNG: 89 50 4E 47
      hex.startsWith("ffd8ff") || // JPEG: FF D8 FF
      hex.startsWith("47494638") || // GIF: 47 49 46 38
      (hex.startsWith("52494646") && hex.substring(16, 24) === "57454250") // WEBP: RIFF...WEBP
    );
  } catch {
    return false;
  }
};

/**
 * Recursively processes any data structure to replace base64 images with placeholders
 */
const replaceBase64Images = (data: any): any => {
  if (typeof data === "string") {
    return isBase64Image(data) ? "[base64_image_placeholder]" : data;
  }

  if (Array.isArray(data)) {
    return data.map(replaceBase64Images);
  }

  if (data && typeof data === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = replaceBase64Images(value);
    }
    return result;
  }

  return data;
};

/**
 * Calculates a simple hash of a message for comparison
 */
const getMessageString = (message: ChatMessage): string =>
  `${message.role}:${normalizeMessageContent(message.content)}`;

/**
 * Checks if messages are likely the same conversation thread
 * Handles cases where content might be truncated or modified
 */
const areMessagesFromSameThread = (messages1: ChatMessage[], messages2: ChatMessage[]): boolean => {
  if (messages1.length === 0 || messages2.length === 0) return false;

  // Check if the first few messages match (likely start of conversation)
  const minLength = Math.min(messages1.length, messages2.length, 3);
  for (let i = 0; i < minLength; i++) {
    if (getMessageString(messages1[i]) !== getMessageString(messages2[i])) {
      return false;
    }
  }
  return true;
};

/**
 * Processes spans to replace base64 images with placeholders
 */
export const replaceBase64ImagesInSpans = (spans: CacheSpan[]): CacheSpan[] =>
  spans.map((span) => ({
    ...span,
    input: replaceBase64Images(span.input),
    output: replaceBase64Images(span.output),
  }));

/**
 * Removes repetitive inputs and outputs from LLM spans in conversation chains.
 * Also replaces base64 images with placeholders.
 * Modifies spans in-place to preserve original ordering.
 */
export const deduplicateSpanContent = (spans: CacheSpan[]): CacheSpan[] => {
  // First replace base64 images in all spans
  const spansWithBase64Replaced = replaceBase64ImagesInSpans(spans);

  // Create a copy to avoid mutating the original array
  const result = [...spansWithBase64Replaced];

  // Store original inputs to avoid using modified data for comparisons
  const originalInputs = new Map<number, ChatMessage[]>();
  const originalOutputs = new Map<number, any>();

  // Find all LLM spans with their original indices and store original data
  const llmSpanIndices: number[] = [];
  for (let i = 0; i < result.length; i++) {
    const span = result[i];
    if (span.type === "LLM" && isChatMessageArray(span.input)) {
      llmSpanIndices.push(i);
      originalInputs.set(i, span.input as ChatMessage[]);
      originalOutputs.set(i, span.output);
    }
  }

  if (llmSpanIndices.length === 0) {
    return result;
  }

  // Group spans into conversation chains using indices
  const conversationChains: number[][] = [];
  const processedIndices = new Set<number>();

  for (const currentIndex of llmSpanIndices) {
    if (processedIndices.has(currentIndex)) continue;

    const currentInput = originalInputs.get(currentIndex)!;

    // Find all spans that are part of this conversation thread
    const chain = [currentIndex];
    processedIndices.add(currentIndex);

    // Look for spans that continue this conversation
    for (const potentialIndex of llmSpanIndices) {
      if (processedIndices.has(potentialIndex)) continue;

      const potentialInput = originalInputs.get(potentialIndex)!;

      // Check if this could be the next turn in the conversation
      if (potentialInput.length > currentInput.length && areMessagesFromSameThread(currentInput, potentialInput)) {
        // Build the expected conversation state after the last span in chain
        const lastIndex = chain[chain.length - 1];
        const lastInput = originalInputs.get(lastIndex)!;
        const lastOutput = originalOutputs.get(lastIndex);

        let expectedMessages = [...lastInput];
        if (isChatMessageArray(lastOutput)) {
          expectedMessages.push(...lastOutput);
        }

        // Check if the potential span's input starts with our expected messages
        const prefixLength = getMessagePrefixLength(expectedMessages, potentialInput);
        if (prefixLength >= expectedMessages.length - 1) {
          // Allow some tolerance
          chain.push(potentialIndex);
          processedIndices.add(potentialIndex);
        }
      }
    }

    // Sort chain by start time to ensure proper chronological order
    chain.sort((a, b) => new Date(result[a].start).getTime() - new Date(result[b].start).getTime());
    conversationChains.push(chain);
  }

  // Process each conversation chain to remove repetitive content
  for (const chain of conversationChains) {
    if (chain.length === 1) {
      continue;
    }

    // Process the chain - replace repetitive content in all but the last span
    for (let i = 0; i < chain.length - 1; i++) {
      const spanIndex = chain[i];
      const span = result[spanIndex];
      const originalInput = originalInputs.get(spanIndex)!;

      // For earlier spans in the chain, replace with condensed version
      let newInput: ChatMessage[];

      // Find the previous span's expected conversation state
      if (i > 0) {
        const prevSpanIndex = chain[i - 1];
        const prevOriginalInput = originalInputs.get(prevSpanIndex)!;
        const prevOriginalOutput = originalOutputs.get(prevSpanIndex);

        let prevConversation = [...prevOriginalInput];
        if (isChatMessageArray(prevOriginalOutput)) {
          prevConversation.push(...prevOriginalOutput);
        }

        // If current input starts with previous conversation, condense it
        const prefixLength = getMessagePrefixLength(prevConversation, originalInput);
        if (prefixLength > 0) {
          const removedCount = prefixLength;
          const newMessages = originalInput.slice(prefixLength);

          newInput = removedCount > 0 ? [createPlaceholderMessage(removedCount), ...newMessages] : originalInput;
        } else {
          // Fallback: replace entire input with placeholder
          newInput = [createPlaceholderMessage(originalInput.length)];
        }
      } else {
        // First span in chain - keep the original input
        newInput = originalInput;
      }

      // Modify the span in-place
      result[spanIndex] = {
        ...span,
        input: newInput,
      };
    }
  }

  return result;
};
