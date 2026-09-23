import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { test } from "node:test";

import { getEvaluationSharePath } from "@/components/evaluation/evaluation-header/share-eval-button";
import { getTraceSharePath } from "@/components/traces/share-trace-button";

const processEnv = process.env as Record<string, string | undefined>;
const expectedBasePath = processEnv.NEXT_PUBLIC_BASE_PATH || "";

if (processEnv.SHARE_LINK_TEST_CHILD === "1") {
  test("share links use the configured base path exactly once", () => {
    assert.equal(getEvaluationSharePath("eval-123"), `${expectedBasePath}/shared/evals/eval-123`);
    assert.equal(getTraceSharePath("trace-456"), `${expectedBasePath}/shared/traces/trace-456`);
  });
} else {
  function runWithBasePath(basePath?: string) {
    const env: NodeJS.ProcessEnv = {
      ...processEnv,
      NODE_ENV: process.env.NODE_ENV,
      SHARE_LINK_TEST_CHILD: "1",
    };
    if (basePath === undefined) {
      delete env.NEXT_PUBLIC_BASE_PATH;
    } else {
      env.NEXT_PUBLIC_BASE_PATH = basePath;
    }

    const result = spawnSync("pnpm", ["exec", "tsx", "--test", "tests/share-link-base-path.test.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 0, result.stderr);
  }

  test("share links use root relative paths when no base path is configured", () => runWithBasePath());

  test("share links include a configured base path without double prefixing", () => runWithBasePath("/lmnr"));
}
