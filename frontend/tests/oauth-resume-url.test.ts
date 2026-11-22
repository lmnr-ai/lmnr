import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { oauthResumeUrl } from "@/lib/oauth-resume-url";

const parse = (url: string) => {
  const [path, query] = url.split("?");
  return { path, params: new URLSearchParams(query) };
};

describe("oauthResumeUrl", () => {
  it("drops the provider's signing params and keeps the client's request", () => {
    const signed = new URLSearchParams(
      "response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A1%2Fcb&scope=openid+email" +
        "&resource=http%3A%2F%2Flocalhost%3A8000%2Fv1%2Fmcp&state=s&exp=1&ba_iat=2&ba_pl=x" +
        "&ba_param=client_id&ba_param=scope&sig=zzz"
    );
    const { path, params } = parse(oauthResumeUrl(signed));
    assert.equal(path, "/api/auth/oauth2/authorize");
    assert.deepEqual(
      [...params.keys()].sort(),
      ["client_id", "redirect_uri", "resource", "response_type", "scope", "state"].sort()
    );
    assert.equal(params.get("resource"), "http://localhost:8000/v1/mcp");
    assert.equal(params.get("scope"), "openid email");
  });

  it("removes prompt=login and max_age so the resumed request does not loop to sign-in", () => {
    const { params } = parse(oauthResumeUrl(new URLSearchParams("client_id=a&prompt=login+consent&max_age=0")));
    assert.equal(params.get("prompt"), "consent");
    assert.equal(params.has("max_age"), false);
    assert.equal(parse(oauthResumeUrl(new URLSearchParams("client_id=a&prompt=login"))).params.has("prompt"), false);
  });

  it("keeps repeated resource indicators", () => {
    const { params } = parse(
      oauthResumeUrl(new URLSearchParams("client_id=a&resource=https%3A%2F%2Fa&resource=https%3A%2F%2Fb"))
    );
    assert.deepEqual(params.getAll("resource"), ["https://a", "https://b"]);
  });
});
