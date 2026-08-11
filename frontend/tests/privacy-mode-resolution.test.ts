import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePrivacyMode,
  shouldStampProtectionFloor,
  tierIntrinsicallyDefaultsToOn,
} from "@/lib/actions/workspace/settings";

describe("tierIntrinsicallyDefaultsToOn", () => {
  it("defaults OFF for free/hobby/starter and ON for pro and unknown tiers", () => {
    for (const tier of ["free", "hobby", "starter", "Free", " HOBBY "]) {
      assert.equal(tierIntrinsicallyDefaultsToOn(tier), false, tier);
    }
    for (const tier of ["pro", "Pro", "enterprise", "unlimited", undefined, null, ""]) {
      assert.equal(tierIntrinsicallyDefaultsToOn(tier), true, String(tier));
    }
  });
});

describe("shouldStampProtectionFloor", () => {
  // Date-independent by design: pre-rollout every tier resolves ON, so a
  // date-gated check would stamp nothing during the notice period and those
  // workspaces would flip OFF the moment per-plan defaults activate.
  it("stamps when leaving a default-ON tier for a default-OFF one", () => {
    assert.equal(shouldStampProtectionFloor("pro", "free"), true);
    assert.equal(shouldStampProtectionFloor("pro", "hobby"), true);
    assert.equal(shouldStampProtectionFloor("enterprise", "starter"), true);
  });

  it("does not stamp when the new tier still defaults ON", () => {
    assert.equal(shouldStampProtectionFloor("free", "pro"), false);
    assert.equal(shouldStampProtectionFloor("pro", "pro"), false);
  });

  it("does not stamp a transition between two default-OFF tiers", () => {
    assert.equal(shouldStampProtectionFloor("free", "hobby"), false);
    assert.equal(shouldStampProtectionFloor("hobby", "free"), false);
  });
});

describe("resolvePrivacyMode precedence", () => {
  it("DPA enforcement wins over an explicit off and locks the toggle", () => {
    assert.deepEqual(resolvePrivacyMode({ dpaEnforcedPrivacyMode: true, privacyMode: false }, "pro"), {
      enabled: true,
      locked: true,
    });
  });

  it("an explicit choice beats the protection floor and the tier default", () => {
    assert.deepEqual(resolvePrivacyMode({ privacyMode: false, privacyModeProtected: true }, "pro"), {
      enabled: false,
      locked: false,
    });
    assert.deepEqual(resolvePrivacyMode({ privacyMode: true }, "free"), { enabled: true, locked: false });
  });

  it("the protection floor keeps an unset workspace ON", () => {
    assert.deepEqual(resolvePrivacyMode({ privacyModeProtected: true }, "free"), { enabled: true, locked: false });
  });

  it("an unset, unprotected workspace resolves ON while the effective date is unset", () => {
    assert.deepEqual(resolvePrivacyMode({}, "free"), { enabled: true, locked: false });
  });
});
