/**
 * Quickwit index migration system
 * Similar to ClickHouse migrations, but for Quickwit indexes
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

const QUICKWIT_SEARCH_URL = process.env.QUICKWIT_SEARCH_URL || "http://localhost:7280";

interface QuickwitIndex {
  index_id: string;
  index_uri: string;
}

/**
 * Check if an index exists in Quickwit
 */
async function indexExists(indexId: string): Promise<boolean> {
  try {
    const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes/${indexId}`);
    return response.ok;
  } catch (error) {
    // If index doesn't exist, Quickwit returns 404
    return false;
  }
}

/**
 * Create an index in Quickwit
 */
async function createIndex(indexConfig: any): Promise<void> {
  const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(indexConfig),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create index ${indexConfig.index_id}: ${response.status} ${errorText}`
    );
  }
}

/**
 * List all existing indexes
 */
async function listIndexes(): Promise<QuickwitIndex[]> {
  try {
    const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes`);
    if (!response.ok) {
      throw new Error(`Failed to list indexes: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to list Quickwit indexes:", error);
    return [];
  }
}

/**
 * Load and parse index configuration file
 */
async function loadIndexConfig(filePath: string): Promise<any> {
  const content = await readFile(filePath, "utf-8");

  const yaml = await import("yaml");
  return yaml.parse(content);
}

/**
 * Initialize Quickwit indexes from migration files
 * Similar to initializeClickHouse in instrumentation.ts
 */
export async function initializeQuickwitIndexes(): Promise<void> {
  try {
    const indexesDir = join(process.cwd(), "lib/quickwit/indexes");

    // Check if directory exists
    let files: string[];
    try {
      files = await readdir(indexesDir);
    } catch (error) {
      console.log("Quickwit indexes directory not found, skipping index initialization");
      return;
    }

    // Filter for config files
    const configFiles = files.filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json")
    );

    if (configFiles.length === 0) {
      console.log("No Quickwit index configurations found");
      return;
    }

    console.log(`Found ${configFiles.length} Quickwit index configuration(s)`);

    // Check Quickwit connectivity
    const existingIndexes = await listIndexes();
    console.log(`Found ${existingIndexes.length} existing Quickwit index(es)`);

    // Process each index config file
    for (const configFile of configFiles) {
      const configPath = join(indexesDir, configFile);
      const indexConfig = await loadIndexConfig(configPath);
      const indexId = indexConfig.index_id;

      if (!indexId) {
        console.warn(`Skipping ${configFile}: missing index_id`);
        continue;
      }

      const exists = await indexExists(indexId);

      if (exists) {
        console.log(`✓ Index "${indexId}" already exists, skipping`);
        // Optionally: check if update is needed (compare configs)
      } else {
        console.log(`Creating index "${indexId}"...`);
        await createIndex(indexConfig);
        console.log(`✓ Index "${indexId}" created successfully`);
      }
    }

    console.log("✓ Quickwit indexes initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Quickwit indexes:", error);
    throw error;
  }
}
