import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Feature, isFeatureEnabled } from "@/lib/features/features";

describe("Feature.EMAIL_AUTOMATIONS", () => {
  const original = { cloud: process.env.LAMINAR_CLOUD, key: process.env.RESEND_API_KEY };

  const setEnv = (cloud: string | undefined, key: string | undefined) => {
    if (cloud === undefined) delete process.env.LAMINAR_CLOUD;
    else process.env.LAMINAR_CLOUD = cloud;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  };

  afterEach(() => setEnv(original.cloud, original.key));

  it("is enabled on Laminar Cloud with a Resend API key", () => {
    setEnv("true", "re_test");
    assert.equal(isFeatureEnabled(Feature.EMAIL_AUTOMATIONS), true);
  });

  it("is disabled on self-hosted even with a Resend API key", () => {
    setEnv(undefined, "re_test");
    assert.equal(isFeatureEnabled(Feature.EMAIL_AUTOMATIONS), false);
    setEnv("false", "re_test");
    assert.equal(isFeatureEnabled(Feature.EMAIL_AUTOMATIONS), false);
  });

  it("is disabled without a Resend API key", () => {
    setEnv("true", undefined);
    assert.equal(isFeatureEnabled(Feature.EMAIL_AUTOMATIONS), false);
    setEnv("true", "");
    assert.equal(isFeatureEnabled(Feature.EMAIL_AUTOMATIONS), false);
  });
});
