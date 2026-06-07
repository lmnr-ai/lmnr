import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { SignJWT } from "jose";

// `secret()` inside code.ts reads NEXTAUTH_SECRET lazily at call time, so
// setting it here (before any mint/verify) is sufficient.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-for-cli-login-code";

import { mintCode, verifyCode } from "@/lib/cli-login/code";

const challengeFor = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

describe("cli-login code (jose HS256)", () => {
  it("mint → verify round-trips claims", async () => {
    const claims = { projectId: "p-1", userId: "u-1", codeChallenge: "challenge-abc" };
    const code = await mintCode(claims);
    const out = await verifyCode(code);
    assert.equal(out.projectId, claims.projectId);
    assert.equal(out.userId, claims.userId);
    assert.equal(out.codeChallenge, claims.codeChallenge);
    assert.equal(typeof out.jti, "string");
  });

  it("rejects a tampered code", async () => {
    const code = await mintCode({ projectId: "p-1", userId: "u-1", codeChallenge: "c" });
    const tampered = code.slice(0, -2) + (code.endsWith("a") ? "bb" : "aa");
    await assert.rejects(() => verifyCode(tampered));
  });

  it("rejects a code signed with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = await new SignJWT({ projectId: "p", userId: "u", codeChallenge: "c" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti("j")
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .setAudience("cli-login-code")
      .sign(new TextEncoder().encode("a-totally-different-secret"));
    await assert.rejects(() => verifyCode(bad));
  });

  it("rejects an expired code", async () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const expired = await new SignJWT({ projectId: "p", userId: "u", codeChallenge: "c" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti("j")
      .setIssuedAt(past)
      .setExpirationTime(past + 60)
      .setAudience("cli-login-code")
      .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));
    await assert.rejects(() => verifyCode(expired));
  });

  it("rejects a code with the wrong audience", async () => {
    const now = Math.floor(Date.now() / 1000);
    const wrongAud = await new SignJWT({ projectId: "p", userId: "u", codeChallenge: "c" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti("j")
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .setAudience("some-other-audience")
      .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));
    await assert.rejects(() => verifyCode(wrongAud));
  });

  it("PKCE challenge re-derivation matches mint-time challenge", async () => {
    const verifier = "verifier-xyz-123";
    const challenge = challengeFor(verifier);
    const code = await mintCode({ projectId: "p", userId: "u", codeChallenge: challenge });
    const out = await verifyCode(code);
    assert.equal(challengeFor(verifier), out.codeChallenge);
    assert.notEqual(challengeFor("wrong-verifier"), out.codeChallenge);
  });
});
