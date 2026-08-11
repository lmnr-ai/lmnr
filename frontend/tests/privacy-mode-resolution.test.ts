import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRIVACY_MODE_TIER_DEFAULTS_EFFECTIVE_DATE,
  resolvePrivacyMode,
  shouldStampProtectionFloor,
  tierIntrinsicallyDefaultsToOn,
} from "@/lib/actions/workspace/settings";

// Both sides of the per-plan-defaults cutoff are pinned explicitly by passing
// `now` — never the ambient clock, or the suite's result would change on the
// effective date. A null date means defaults never activate, so "after" is
// unreachable and those assertions are skipped rather than asserted wrongly.
const effectiveAt = PRIVACY_MODE_TIER_DEFAULTS_EFFECTIVE_DATE
  ? new Date(PRIVACY_MODE_TIER_DEFAULTS_EFFECTIVE_DATE).getTime()
  : null;
const BEFORE_CUTOFF = effectiveAt !== null ? effectiveAt - 86_400_000 : 0;
const AFTER_CUTOFF = effectiveAt !== null ? effectiveAt + 86_400_000 : 0;

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
  // Precedence is date-independent, so these assert at both cutoff sides.
  for (const [label, now] of [
    ["before the effective date", BEFORE_CUTOFF],
    ["after the effective date", AFTER_CUTOFF],
  ] as const) {
    it(`DPA enforcement wins over an explicit off and locks the toggle (${label})`, () => {
      assert.deepEqual(resolvePrivacyMode({ dpaEnforcedPrivacyMode: true, privacyMode: false }, "pro", now), {
        enabled: true,
        locked: true,
      });
    });

    it(`an explicit choice beats the protection floor and the tier default (${label})`, () => {
      assert.deepEqual(resolvePrivacyMode({ privacyMode: false, privacyModeProtected: true }, "pro", now), {
        enabled: false,
        locked: false,
      });
      assert.deepEqual(resolvePrivacyMode({ privacyMode: true }, "free", now), { enabled: true, locked: false });
    });

    it(`the protection floor keeps an unset workspace ON (${label})`, () => {
      assert.deepEqual(resolvePrivacyMode({ privacyModeProtected: true }, "free", now), {
        enabled: true,
        locked: false,
      });
    });
  }
});

describe("resolvePrivacyMode per-plan defaults across the effective date", () => {
  it("an unset, unprotected workspace resolves ON on every plan before the effective date", () => {
    for (const tier of ["free", "hobby", "starter", "pro"]) {
      assert.deepEqual(resolvePrivacyMode({}, tier, BEFORE_CUTOFF), { enabled: true, locked: false }, tier);
    }
  });

  it("after the effective date, per-plan defaults take over (free/hobby OFF, pro ON)", (t) => {
    if (effectiveAt === null) {
      t.skip("PRIVACY_MODE_TIER_DEFAULTS_EFFECTIVE_DATE is null — defaults never activate");
      return;
    }
    for (const tier of ["free", "hobby", "starter"]) {
      assert.deepEqual(resolvePrivacyMode({}, tier, AFTER_CUTOFF), { enabled: false, locked: false }, tier);
    }
    for (const tier of ["pro", "enterprise", "unlimited"]) {
      assert.deepEqual(resolvePrivacyMode({}, tier, AFTER_CUTOFF), { enabled: true, locked: false }, tier);
    }
  });
});
