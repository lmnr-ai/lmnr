import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { buildSignupSlackMessage, notifySignupInSlack } from "@/lib/signup-notifications";

const WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/XXXX";

const setEnv = (cloud: string | undefined, webhook: string | undefined) => {
  if (cloud === undefined) delete process.env.LAMINAR_CLOUD;
  else process.env.LAMINAR_CLOUD = cloud;
  if (webhook === undefined) delete process.env.SIGNUP_SLACK_WEBHOOK_URL;
  else process.env.SIGNUP_SLACK_WEBHOOK_URL = webhook;
};

const original = { cloud: process.env.LAMINAR_CLOUD, webhook: process.env.SIGNUP_SLACK_WEBHOOK_URL };

describe("Feature.SIGNUP_SLACK_NOTIFICATIONS", () => {
  afterEach(() => setEnv(original.cloud, original.webhook));

  it("is enabled on Laminar Cloud with a webhook URL", () => {
    setEnv("true", WEBHOOK_URL);
    assert.equal(isFeatureEnabled(Feature.SIGNUP_SLACK_NOTIFICATIONS), true);
  });

  it("is disabled on self-hosted even with a webhook URL", () => {
    setEnv(undefined, WEBHOOK_URL);
    assert.equal(isFeatureEnabled(Feature.SIGNUP_SLACK_NOTIFICATIONS), false);
  });

  it("is disabled without a webhook URL", () => {
    setEnv("true", "");
    assert.equal(isFeatureEnabled(Feature.SIGNUP_SLACK_NOTIFICATIONS), false);
  });
});

describe("buildSignupSlackMessage", () => {
  it("skips consumer, academic and malformed emails", () => {
    for (const email of ["ada@gmail.com", "ada@outlook.co.uk", "ada@proton.me", "ada@mit.edu", "ada@ox.ac.uk", "ada"]) {
      assert.equal(buildSignupSlackMessage({ email, name: "Ada" }), null, email);
    }
  });

  it("posts company sign-ups with the org domain", () => {
    assert.deepEqual(buildSignupSlackMessage({ email: "ada@eng.acme.co.uk", name: "Ada Lovelace" }), {
      text: ":tada: New sign-up from <https://acme.co.uk|acme.co.uk>\n*Name:* Ada Lovelace\n*Email:* ada@eng.acme.co.uk",
    });
  });

  it("omits a blank name", () => {
    assert.deepEqual(buildSignupSlackMessage({ email: "ada@acme.com", name: "  " }), {
      text: ":tada: New sign-up from <https://acme.com|acme.com>\n*Email:* ada@acme.com",
    });
  });

  it("escapes Slack control characters in the name", () => {
    const message = buildSignupSlackMessage({ email: "ada@acme.com", name: "<!channel> & <http://x|y>" });
    assert.match(message!.text, /\*Name:\* &lt;!channel&gt; &amp; &lt;http:\/\/x\|y&gt;/);
  });
});

describe("notifySignupInSlack", () => {
  const originalFetch = globalThis.fetch;
  let calls: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("ok");
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setEnv(original.cloud, original.webhook);
  });

  it("posts company sign-ups to the webhook", async () => {
    setEnv("true", WEBHOOK_URL);
    await notifySignupInSlack({ email: "ada@acme.com", name: "Ada" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, WEBHOOK_URL);
    assert.equal(calls[0].init?.method, "POST");
    assert.match(JSON.parse(calls[0].init?.body as string).text, /acme\.com/);
  });

  it("does not post consumer sign-ups", async () => {
    setEnv("true", WEBHOOK_URL);
    await notifySignupInSlack({ email: "ada@gmail.com", name: "Ada" });
    assert.equal(calls.length, 0);
  });

  it("does not post when the feature is off", async () => {
    setEnv(undefined, WEBHOOK_URL);
    await notifySignupInSlack({ email: "ada@acme.com", name: "Ada" });
    assert.equal(calls.length, 0);
  });

  it("never throws when Slack fails", async () => {
    setEnv("true", WEBHOOK_URL);
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await notifySignupInSlack({ email: "ada@acme.com", name: "Ada" });
  });
});
