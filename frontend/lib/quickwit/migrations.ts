/**
 * Quickwit index migration system
 * Similar to ClickHouse migrations, but for Quickwit indexes
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

const QUICKWIT_SEARCH_URL = process.env.QUICKWIT_SEARCH_URL || "http://localhost:7280";

// Quickwit's own default; drift is checked against it when no override is set,
// so unsetting the env var reverts a previously overridden index.
const QUICKWIT_DEFAULT_COMMIT_TIMEOUT_SECS = 60;

interface QuickwitIndex {
  index_id: string;
  index_uri: string;
}

/**
 * Fetch an index's metadata, or null if the index doesn't exist
 */
async function getIndex(indexId: string): Promise<any | null> {
  const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes/${indexId}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get index ${indexId}: ${response.status} ${errorText}`);
  }
  return await response.json();
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
    throw new Error(`Failed to create index ${indexConfig.index_id}: ${response.status} ${errorText}`);
  }
}

/**
 * Replace an existing index's config (Quickwit >= 0.9). Every section is
 * replaced, so settings absent from `indexConfig` revert to Quickwit defaults.
 */
async function updateIndex(indexConfig: any): Promise<void> {
  const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes/${indexConfig.index_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(indexConfig),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update index ${indexConfig.index_id}: ${response.status} ${errorText}`);
  }
}

/**
 * List all existing indexes. Throws if Quickwit is unreachable.
 */
async function listIndexes(): Promise<QuickwitIndex[]> {
  const response = await fetch(`${QUICKWIT_SEARCH_URL}/api/v1/indexes`);
  if (!response.ok) {
    throw new Error(`Failed to list indexes: ${response.status}`);
  }
  return await response.json();
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
 * e.g. spans_v2 -> QUICKWIT_SPANS_V2_COMMIT_TIMEOUT_SECS
 */
function commitTimeoutEnvName(indexId: string): string {
  return `QUICKWIT_${indexId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_COMMIT_TIMEOUT_SECS`;
}

function applyEnvOverrides(indexConfig: any): any {
  const envName = commitTimeoutEnvName(indexConfig.index_id);
  const raw = process.env[envName]?.trim();
  if (!raw) {
    return indexConfig;
  }

  const commitTimeoutSecs = Number(raw);
  if (!Number.isInteger(commitTimeoutSecs) || commitTimeoutSecs <= 0) {
    console.warn(`Ignoring ${envName}="${raw}": expected a positive integer`);
    return indexConfig;
  }

  return {
    ...indexConfig,
    indexing_settings: { ...indexConfig.indexing_settings, commit_timeout_secs: commitTimeoutSecs },
  };
}

/**
 * True if any leaf of `desired` differs from the same path in `current`.
 * Keys absent from `desired` are ignored, since Quickwit fills in defaults.
 */
function isSubsetMismatch(desired: any, current: any): boolean {
  if (Array.isArray(desired)) {
    return (
      !Array.isArray(current) ||
      desired.length !== current.length ||
      desired.some((item, i) => isSubsetMismatch(item, current[i]))
    );
  }
  if (desired !== null && typeof desired === "object") {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return true;
    }
    return Object.keys(desired).some(
      (key) =>
        !(key === "fast" && isFastRawAlias(desired[key], current[key])) && isSubsetMismatch(desired[key], current[key])
    );
  }
  return desired !== current;
}

// Quickwit echoes `fast: true` on text/json fields back as `{ normalizer: "raw" }`.
function isFastRawAlias(desired: any, current: any): boolean {
  return (
    desired === true &&
    current !== null &&
    typeof current === "object" &&
    current.normalizer === "raw" &&
    Object.keys(current).length === 1
  );
}

function needsUpdate(desired: any, current: any): boolean {
  const { version: _version, ...rest } = desired;
  const target = {
    ...rest,
    indexing_settings: {
      commit_timeout_secs: QUICKWIT_DEFAULT_COMMIT_TIMEOUT_SECS,
      ...rest.indexing_settings,
    },
  };
  return isSubsetMismatch(target, current.index_config);
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
    const configFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"));

    if (configFiles.length === 0) {
      console.log("No Quickwit index configurations found");
      return;
    }

    console.log(`Found ${configFiles.length} Quickwit index configuration(s)`);

    // Check Quickwit connectivity
    const existingIndexes = await listIndexes();
    console.log(`Found ${existingIndexes.length} existing Quickwit index(es)`);

    const failedIndexes: string[] = [];

    // Process each index config file
    for (const configFile of configFiles) {
      const configPath = join(indexesDir, configFile);
      const loadedConfig = await loadIndexConfig(configPath);
      const indexId = loadedConfig.index_id;

      if (!indexId) {
        console.warn(`Skipping ${configFile}: missing index_id`);
        continue;
      }

      // A rejected PUT (e.g. a mapping change Quickwit disallows) must not
      // block the remaining indexes.
      try {
        const indexConfig = applyEnvOverrides(loadedConfig);
        const current = await getIndex(indexId);

        if (!current) {
          console.log(`Creating index "${indexId}"...`);
          await createIndex(indexConfig);
          console.log(`✓ Index "${indexId}" created successfully`);
        } else if (needsUpdate(indexConfig, current)) {
          console.log(`Updating index "${indexId}"...`);
          await updateIndex(indexConfig);
          console.log(`✓ Index "${indexId}" updated`);
        } else {
          console.log(`✓ Index "${indexId}" up to date`);
        }
      } catch (error) {
        console.error(`Failed to initialize Quickwit index "${indexId}":`, error);
        failedIndexes.push(indexId);
      }
    }

    if (failedIndexes.length > 0) {
      console.warn(`Quickwit indexes initialized with failures: ${failedIndexes.join(", ")}`);
    } else {
      console.log("✓ Quickwit indexes initialized successfully");
    }
  } catch (error) {
    console.error("Failed to initialize Quickwit indexes:", error);
    throw error;
  }
}
