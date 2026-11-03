import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { getLicenseBannerMessage } from "@/components/license/license-message";
import {
  isLicenseExpired,
  LICENSE_PUBLIC_KEYS,
  publicKeyFromSeed,
  signLicense,
  verifyLicense,
} from "@/lib/license/format";
import { daysUntil, isLicenseExpiringSoon, type LicenseStatus } from "@/lib/license/types";

const SEED = Buffer.alloc(32, 7);
const SPARE_SEED = Buffer.alloc(32, 9);
const TEST_PUBLIC_KEYS = [publicKeyFromSeed(SEED), publicKeyFromSeed(SPARE_SEED)];
// Also verified by app-server/src/license/key.rs, which pins the wire format across both.
const RUST_VECTOR =
  "lmnr_lic_eyJ2IjoxLCJsaWNlbnNlSWQiOiIwYjlmM2MxZS02YTNjLTRlOGUtOWQ1NS0yZjFmNmYwYzdhMTEiLCJjdXN0b21lciI6IkFjbWUgQ29ycCIsImlzc3VlZEF0IjoxNzYxNjk2MDAwLCJleHBpcmVzQXQiOjE3OTMyMzIwMDB9.mbGz5dOgcFeUrzn-qYK2D3gRRHQgGfGDzZ2srkKjMWtO1PXvBvZeUcPawl-H2eBiKRXIOE-xlZd3ruf5WmlwAA";

const payload = {
  v: 1,
  licenseId: "0b9f3c1e-6a3c-4e8e-9d55-2f1f6f0c7a11",
  customer: "Acme Corp",
  issuedAt: 1761696000,
  expiresAt: 1793232000,
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-01T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

const status = (overrides: Partial<LicenseStatus>): LicenseStatus => ({
  status: "trial",
  eeEnabled: true,
  trialEndsAt: null,
  license: null,
  licenseSource: null,
  invalidKeySource: null,
  ...overrides,
});

describe("license keys", () => {
  it("signs deterministically to the vector the Rust verifier checks", () => {
    assert.equal(signLicense(payload, SEED), RUST_VECTOR);
  });

  it("verifies a key signed by the matching seed", () => {
    assert.deepEqual(verifyLicense(RUST_VECTOR, TEST_PUBLIC_KEYS), payload);
  });

  it("verifies a key signed by any listed public key", () => {
    assert.deepEqual(verifyLicense(signLicense(payload, SPARE_SEED), TEST_PUBLIC_KEYS), payload);
  });

  // The Rust verifier lives only in the enterprise repo; OSS skips this check.
  const keyRsPath = path.join(__dirname, "../../app-server/src/license/key.rs");
  it("lists the same public keys as the app-server", { skip: !existsSync(keyRsPath) }, () => {
    const keyRs = readFileSync(keyRsPath, "utf8");
    const rustList = keyRs.match(/const PUBLIC_KEYS: &\[&str\] = &\[([^\]]*)\]/)?.[1] ?? "";
    assert.deepEqual(
      [...rustList.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      [...LICENSE_PUBLIC_KEYS]
    );
  });

  it("rejects a key signed by another seed", () => {
    assert.equal(verifyLicense(RUST_VECTOR), null);
    assert.equal(verifyLicense(signLicense(payload, Buffer.alloc(32, 8)), TEST_PUBLIC_KEYS), null);
  });

  it("rejects a tampered payload", () => {
    assert.equal(verifyLicense(RUST_VECTOR.replace("eyJ2", "eyJ3"), TEST_PUBLIC_KEYS), null);
  });

  it("rejects malformed keys", () => {
    assert.equal(verifyLicense("lmnr_0123456789abcdef", TEST_PUBLIC_KEYS), null);
    assert.equal(verifyLicense("lmnr_lic_onlyonesegment", TEST_PUBLIC_KEYS), null);
    assert.equal(verifyLicense("lmnr_lic_a.b.c", TEST_PUBLIC_KEYS), null);
  });

  it("expires a license at its expiresAt, with no grace period", () => {
    const expiresAtMs = payload.expiresAt * 1000;
    assert.equal(isLicenseExpired(payload, expiresAtMs - 1000), false);
    assert.equal(isLicenseExpired(payload, expiresAtMs), true);
    assert.equal(isLicenseExpired({ ...payload, expiresAt: null }, expiresAtMs * 10), false);
  });

  it("rejects an unsupported version", () => {
    assert.equal(verifyLicense(signLicense({ ...payload, v: 2 }, SEED), TEST_PUBLIC_KEYS), null);
  });
});

describe("license status helpers", () => {
  it("rounds days up and never goes negative", () => {
    assert.equal(daysUntil(iso(0.2), NOW), 1);
    assert.equal(daysUntil(iso(-3), NOW), 0);
  });

  it("flags an active license expiring within 14 days", () => {
    const licensed = (expiresAt: string | null) =>
      status({
        status: "active",
        license: { licenseId: payload.licenseId, customer: "Acme Corp", issuedAt: iso(-300), expiresAt },
      });
    assert.equal(isLicenseExpiringSoon(licensed(iso(10)), NOW), true);
    assert.equal(isLicenseExpiringSoon(licensed(iso(60)), NOW), false);
    assert.equal(isLicenseExpiringSoon(licensed(null), NOW), false);
  });
});

describe("license banner", () => {
  it("warns in the last days of the trial", () => {
    const early = getLicenseBannerMessage(status({ trialEndsAt: iso(10) }), NOW);
    assert.equal(early?.tone, "info");
    assert.match(early?.text ?? "", /10 days left/);

    const late = getLicenseBannerMessage(status({ trialEndsAt: iso(1) }), NOW);
    assert.equal(late?.tone, "warning");
    assert.match(late?.text ?? "", /1 day left/);
  });

  it("shows a critical banner once EE is off", () => {
    for (const kind of ["trialExpired", "expired"] as const) {
      const message = getLicenseBannerMessage(status({ status: kind, eeEnabled: false }), NOW);
      assert.equal(message?.tone, "critical");
    }
  });

  it("shows nothing for a healthy license", () => {
    const message = getLicenseBannerMessage(
      status({
        status: "active",
        license: { licenseId: payload.licenseId, customer: "Acme Corp", issuedAt: iso(-30), expiresAt: iso(300) },
      }),
      NOW
    );
    assert.equal(message, null);
  });
});

describe("EE license text", () => {
  const imageCopyPath = path.join(__dirname, "../../app-server/LICENSE.md");
  it("ships the /policies/ee-license text in the app-server image", { skip: !existsSync(imageCopyPath) }, () => {
    const policy = readFileSync(path.join(__dirname, "../lib/policies/content/ee-license.md"), "utf8");
    const body = policy.replace(/^---\n[\s\S]*?\n---\n\n/, "");
    assert.equal(readFileSync(imageCopyPath, "utf8"), body);
  });

  it(
    "keeps the repository LICENSE.md in sync with the policy's ELv2 text",
    { skip: !existsSync(imageCopyPath) },
    () => {
      const normalize = (text: string) =>
        text
          .split("\n")
          .filter((line) => !line.startsWith("Copyright (c)") && !line.startsWith("URL:"))
          .join(" ")
          .replace(/#/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const policy = readFileSync(path.join(__dirname, "../lib/policies/content/ee-license.md"), "utf8");
      const elv2 = policy.slice(policy.indexOf("# Elastic License 2.0"));
      const repoLicense = readFileSync(path.join(__dirname, "../../LICENSE.md"), "utf8");
      assert.equal(normalize(repoLicense), normalize(elv2));
    }
  );
});
