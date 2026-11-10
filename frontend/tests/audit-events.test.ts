import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { AUDIT_ACTIONS, AUDIT_OUTCOMES, AUDIT_RESOURCES, AUDIT_SOURCES, outcomeFromStatus } from "@/lib/audit/events";

const rust = readFileSync(join(__dirname, "../../app-server/src/audit/mod.rs"), "utf8");

const toSnake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// Variant names of a unit enum, skipping attributes and comments.
const rustVariants = (enumName: string): string[] => {
  const body = rust.match(new RegExp(`pub enum ${enumName} \\{([^}]*)\\}`))?.[1];
  assert.ok(body, `enum ${enumName} not found in audit/mod.rs`);
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Z]\w*,$/.test(line))
    .map((line) => toSnake(line.slice(0, -1)));
};

test("audit resources match app-server", () => {
  assert.deepEqual([...AUDIT_RESOURCES], rustVariants("AuditResource"));
});

test("audit actions match app-server", () => {
  assert.deepEqual([...AUDIT_ACTIONS], rustVariants("AuditAction"));
});

test("audit sources and outcomes match app-server", () => {
  assert.deepEqual([...AUDIT_SOURCES], rustVariants("AuditSource"));
  assert.deepEqual([...AUDIT_OUTCOMES], rustVariants("AuditOutcome"));
});

test("outcomeFromStatus matches the app-server mapping", () => {
  assert.equal(outcomeFromStatus(200), "success");
  assert.equal(outcomeFromStatus(302), "success");
  assert.equal(outcomeFromStatus(401), "denied");
  assert.equal(outcomeFromStatus(403), "denied");
  assert.equal(outcomeFromStatus(404), "error");
  assert.equal(outcomeFromStatus(500), "error");
});
