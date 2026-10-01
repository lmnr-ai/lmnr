import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { orgDomainFromEmail, orgNameFromEmail } from "@/lib/email-domain";

describe("orgDomainFromEmail", () => {
  const cases: Array<[string, string | null]> = [
    ["ada@acme.com", "acme.com"],
    ["ada@eng.acme.co.uk", "acme.co.uk"],
    ["ada@ACME.ai", "acme.ai"],
    ["ada@gmail.com", null],
    ["ada@pm.me", null],
    ["ada@stanford.edu", null],
    ["ada@ox.ac.uk", null],
    ["ada@evil.com/x", null],
    ["ada@localhost", null],
    ["", null],
  ];
  for (const [email, expected] of cases) {
    it(`${JSON.stringify(email)} -> ${expected}`, () => assert.equal(orgDomainFromEmail(email), expected));
  }

  it("names the org from its domain", () => assert.equal(orgNameFromEmail("ada@my-company.io"), "My-Company"));
});
