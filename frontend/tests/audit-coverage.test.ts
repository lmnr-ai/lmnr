import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Every mutating route export must decide explicitly whether it is audited:
// `export const POST = withAudit(...)` or `export const POST = noAudit("reason", ...)`.
const API_ROOT = join(__dirname, "../app/api");
const MUTATING = /^export (?:async function|const) (POST|PUT|PATCH|DELETE)\b(.*)$/gm;

const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });

test("every mutating route export is wrapped in withAudit or noAudit", () => {
  const unclassified: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const [, method, rest] of source.matchAll(MUTATING)) {
      const key = `${relative(API_ROOT, file)} ${method}`;
      if (/^\s*=\s*(withAudit|noAudit)(<[^(]*>)?\(/.test(rest)) continue;
      unclassified.push(key);
    }
  }
  assert.deepEqual(unclassified, [], "wrap these exports in withAudit(...) or noAudit(reason, ...)");
});

// Each audited export names what it acted on; nothing is inferred from the path, body or response.
const AUDITED = /^export const (\w+)\s*=\s*withAudit(?:<[^(]*>)?\(\s*(\{[^}]*\})/gm;

test("every audited handler names its target", () => {
  const missing: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(AUDITED)) {
      const [, method, meta] = match;
      const start = match.index + match[0].length;
      const next = source.indexOf("\nexport ", start);
      const body = source.slice(start, next === -1 ? undefined : next);
      const key = `${relative(API_ROOT, file)} ${method}`;
      if (/\bnoTarget:\s*true\b/.test(meta)) continue;
      // A delete reads the names before the rows are gone.
      if (/action:\s*"delete"/.test(meta) && !/\bawait audit\.target\(|\baudit\.skip\(/.test(body)) {
        missing.push(`${key} (delete: await audit.target(...) before deleting)`);
      } else if (!/\baudit\.(target|skip)\(/.test(body)) {
        missing.push(key);
      }
    }
  }
  assert.deepEqual(missing, [], "call audit.target(...) in these handlers, or set noTarget: true in their meta");
});
