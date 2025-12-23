export interface SystemMessage {
  id: string;
  name: string; // e.g., "message_1", "message_2"
  content: string;
  spanIds: string[]; // Which spans use this message (for originals)
  isOriginal: boolean; // true for messages from backend, false for user-created variants
  originalId?: string; // If this is a variant, points to the original message ID
}

/**
 * Fetch system messages from the API
 */
export async function fetchSystemMessages(
  projectId: string,
  traceId: string
): Promise<Map<string, SystemMessage>> {
  const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/spans/system-messages`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch system messages");
  }

  const data = await response.json() as Array<{
    id: string;
    content: string;
    spanIds: string[];
  }>;

  const systemMessagesMap = new Map<string, SystemMessage>();

  data.forEach((msg, index) => {
    const name = `message_${index + 1}`;
    systemMessagesMap.set(msg.id, {
      id: msg.id,
      name,
      content: msg.content,
      spanIds: msg.spanIds,
      isOriginal: true,
    });
  });

  return systemMessagesMap;
}

/**
 * Create a variant of a system message
 */
export function createMessageVariant(
  systemMessagesMap: Map<string, SystemMessage>,
  originalId: string,
  newContent: string
): { updatedMap: Map<string, SystemMessage>; variantId: string } {
  const newMap = new Map(systemMessagesMap);
  
  // Generate new variant ID and name
  const variantCount = Array.from(newMap.values()).filter(
    (m) => !m.isOriginal
  ).length;
  const variantId = `variant_${Date.now()}_${variantCount}`;
  const variantName = `variant_${variantCount + 1}`;
  
  const original = newMap.get(originalId);
  
  newMap.set(variantId, {
    id: variantId,
    name: variantName,
    content: newContent,
    spanIds: [],
    isOriginal: false,
    originalId,
  });

  return { updatedMap: newMap, variantId };
}

/**
 * Update a message variant's content
 */
export function updateMessageVariant(
  systemMessagesMap: Map<string, SystemMessage>,
  variantId: string,
  newContent: string
): Map<string, SystemMessage> {
  const newMap = new Map(systemMessagesMap);
  const variant = newMap.get(variantId);
  
  if (variant && !variant.isOriginal) {
    variant.content = newContent;
  }

  return newMap;
}

/**
 * Delete a message variant
 */
export function deleteMessageVariant(
  systemMessagesMap: Map<string, SystemMessage>,
  variantId: string
): Map<string, SystemMessage> {
  const newMap = new Map(systemMessagesMap);
  const message = newMap.get(variantId);
  
  // Only allow deleting variants, not originals
  if (message && !message.isOriginal) {
    newMap.delete(variantId);
  }

  return newMap;
}

