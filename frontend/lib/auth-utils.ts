import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';

import { cache } from './cache';
import { db } from './db/drizzle';
import { projectApiKeys } from './db/migrations/schema';

export interface ProjectApiKeyData {
  projectId: string;
  name: string | null;
  hash: string;
  shorthand: string;
}

/**
 * Hash an API key using SHA3-256, similar to the Rust implementation
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha3-256').update(apiKey).digest('hex');
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }

  return authHeader.slice(bearerPrefix.length).trim();
}

/**
 * Type guard to check if cached result is valid ProjectApiKeyData
 */
function isValidProjectApiKeyData(data: any): data is ProjectApiKeyData {
  return data &&
    typeof data.projectId === 'string' &&
    (data.name === null || typeof data.name === 'string') &&
    typeof data.hash === 'string' &&
    typeof data.shorthand === 'string';
}

/**
 * Validate project API key and return project information
 * Similar to get_api_key_from_raw_value in Rust
 */
export async function validateProjectApiKey(rawApiKey: string): Promise<ProjectApiKeyData | null> {
  const apiKeyHash = hashApiKey(rawApiKey);
  const cacheKey = `project_api_key:${apiKeyHash}`;

  try {
    const cachedResult = await cache.get(cacheKey);
    if (isValidProjectApiKeyData(cachedResult)) {
      return cachedResult;
    }
  } catch (e) {
    console.error("Error getting API key from cache", e);
  }

  try {
    const result = await db
      .select({
        projectId: projectApiKeys.projectId,
        name: projectApiKeys.name,
        hash: projectApiKeys.hash,
        shorthand: projectApiKeys.shorthand,
      })
      .from(projectApiKeys)
      .where(eq(projectApiKeys.hash, apiKeyHash))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const apiKeyData = result[0];

    try {
      await cache.set(cacheKey, apiKeyData);
    } catch (e) {
      console.error("Error setting API key in cache", e);
    }

    return apiKeyData;
  } catch (error) {
    console.error("Database error validating API key:", error);
    return null;
  }
}
