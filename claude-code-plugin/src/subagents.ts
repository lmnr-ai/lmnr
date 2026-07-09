import * as fs from "node:fs";
import * as path from "node:path";
import { info } from "./logger.js";
import type { Row } from "./types.js";

export interface SubagentTranscript {
  path: string;
  agentId: string;
  agentType?: string;
  description?: string;
}

const META_SUFFIX = ".meta.json";

/** Map launching Agent/Task tool_use ids to their subagent transcripts. */
export function getSubagentTranscriptsByToolUseId(transcriptPath: string): Record<string, SubagentTranscript> {
  const ext = path.extname(transcriptPath);
  const stem = path.basename(transcriptPath, ext);
  const subagentDir = path.join(path.dirname(transcriptPath), stem, "subagents");

  let entries: string[];
  try {
    if (!fs.statSync(subagentDir).isDirectory()) {
      return {};
    }
    entries = fs.readdirSync(subagentDir);
  } catch {
    return {};
  }

  const result: Record<string, SubagentTranscript> = {};
  for (const name of entries) {
    if (!name.endsWith(META_SUFFIX)) {
      continue;
    }
    const metaPath = path.join(subagentDir, name);
    let metadata: Row;
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch {
      continue;
    }

    const toolUseId = metadata.toolUseId;
    if (typeof toolUseId !== "string" || !toolUseId) {
      continue;
    }

    const stemName = name.slice(0, -META_SUFFIX.length);
    const jsonlPath = path.join(subagentDir, `${stemName}.jsonl`);
    if (!fs.existsSync(jsonlPath)) {
      continue;
    }

    let agentId = stemName;
    if (agentId.startsWith("agent-")) {
      agentId = agentId.slice("agent-".length);
    }

    result[toolUseId] = {
      path: jsonlPath,
      agentId,
      agentType: metadata.agentType,
      description: metadata.description,
    };
  }
  return result;
}

export function getTaskIdToToolUseId(
  subagentTranscriptsByToolUseId?: Record<string, SubagentTranscript>
): Record<string, string> {
  const taskIdToToolUseId: Record<string, string> = {};
  if (!subagentTranscriptsByToolUseId) {
    return taskIdToToolUseId;
  }
  for (const [toolUseId, subagent] of Object.entries(subagentTranscriptsByToolUseId)) {
    const agentId = subagent.agentId;
    if (typeof agentId === "string" && agentId) {
      taskIdToToolUseId[agentId] = toolUseId;
    }
  }
  return taskIdToToolUseId;
}

export function readSubagentJsonl(filePath: string): Row[] | null {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  } catch (e) {
    info(`subagent transcript read failed (${filePath}): ${e}`);
    return null;
  }

  const rows: Row[] = [];
  let lineNumber = 0;
  for (const rawLine of lines) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch (e) {
      info(`subagent transcript line skipped (${filePath}:${lineNumber}): ${e}`);
      continue;
    }
    if (typeof row !== "object" || row === null) {
      info(`subagent transcript line skipped (${filePath}:${lineNumber}): expected JSON object`);
      continue;
    }
    rows.push(row as Row);
  }
  return rows;
}
