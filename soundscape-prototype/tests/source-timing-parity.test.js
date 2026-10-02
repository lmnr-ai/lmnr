import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

const result = spawnSync("pnpm", ["exec", "tsx", "scripts/generate-soundtrack-timings.ts", "--check"], {
  cwd: new URL("../../poc/", import.meta.url),
  encoding: "utf8",
});

assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
console.log("Soundtrack timings match the authoritative DialKit timelines and samplers.");
