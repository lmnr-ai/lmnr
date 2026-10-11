import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { decryptValue, encryptValue } from "@/lib/crypto";

const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const original = process.env.AEAD_SECRET_KEY;

describe("AEAD_SECRET_KEY validation", () => {
  afterEach(() => {
    process.env.AEAD_SECRET_KEY = original;
  });

  it("round-trips with a 64-hex-character key", async () => {
    process.env.AEAD_SECRET_KEY = VALID_KEY;
    const { nonce, value } = await encryptValue("profile-1", "sk-test");
    assert.equal(await decryptValue("profile-1", nonce, value), "sk-test");
  });

  it("names the problem for a malformed key instead of a generic crypto failure", async () => {
    for (const bad of [VALID_KEY.slice(0, 60), `${VALID_KEY.slice(0, 63)}z`, `"${VALID_KEY}"`]) {
      process.env.AEAD_SECRET_KEY = bad;
      await assert.rejects(encryptValue("profile-1", "sk-test"), /AEAD_SECRET_KEY must be 64 hex characters/);
      await assert.rejects(decryptValue("profile-1", "00", "00"), /AEAD_SECRET_KEY must be 64 hex characters/);
    }
  });

  it("reports an unset key", async () => {
    delete process.env.AEAD_SECRET_KEY;
    await assert.rejects(encryptValue("profile-1", "sk-test"), /AEAD_SECRET_KEY environment variable is not set/);
  });
});
