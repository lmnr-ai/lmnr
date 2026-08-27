import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_WORKSPACE_NAME, workspaceNameFromEmail } from "@/lib/actions/cli-auth/defaults";

describe("workspaceNameFromEmail", () => {
  const companyCases: Array<[string, string]> = [
    ["ada@acme.com", "Acme"],
    ["ada@ACME.COM", "Acme"],
    ["ada@acme.co.uk", "Acme"],
    ["ada@acme.com.au", "Acme"],
    ["ada@eng.acme.com", "Acme"],
    ["ada@my-company.io", "My-Company"],
    ["ada+cli@acme.dev", "Acme"],
  ];

  for (const [email, expected] of companyCases) {
    it(`infers ${expected} from ${email}`, () => {
      assert.equal(workspaceNameFromEmail(email), expected);
    });
  }

  const genericCases = [
    "ada@gmail.com",
    "ada@googlemail.com",
    "ada@yahoo.co.uk",
    "ada@hotmail.fr",
    "ada@outlook.com",
    "ada@icloud.com",
    "ada@proton.me",
    "ada@qq.com",
    "ada@web.de",
    "ada@mail.ru",
  ];

  for (const email of genericCases) {
    it(`falls back to the default workspace name for ${email}`, () => {
      assert.equal(workspaceNameFromEmail(email), DEFAULT_WORKSPACE_NAME);
    });
  }

  const malformedCases = ["", "not-an-email", "ada@", "ada@localhost", "ada@.com", null, undefined];

  for (const email of malformedCases) {
    it(`falls back to the default workspace name for ${JSON.stringify(email)}`, () => {
      assert.equal(workspaceNameFromEmail(email), DEFAULT_WORKSPACE_NAME);
    });
  }
});
