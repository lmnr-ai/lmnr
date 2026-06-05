import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  type JWK,
  jwtVerify,
  type KeyLike,
  SignJWT,
} from "jose";

import { decryptValue, encryptValue } from "@/lib/crypto";

const ALG = "RS256";
const AAD = "oauth-signing-key";

// libsodium needs a 32-byte hex key. The signing-key module stores private
// PKCS8 PEMs wrapped under this exact additional-data tag, so the test path
// must match.
const ORIG_AEAD = process.env.AEAD_SECRET_KEY;

describe("oauth signing key roundtrip", () => {
  before(() => {
    if (!process.env.AEAD_SECRET_KEY) {
      process.env.AEAD_SECRET_KEY = randomBytes(32).toString("hex");
    }
  });

  after(() => {
    if (ORIG_AEAD === undefined) {
      delete process.env.AEAD_SECRET_KEY;
    } else {
      process.env.AEAD_SECRET_KEY = ORIG_AEAD;
    }
  });

  it("generates → wraps → unwraps → signs → verifies via JWKS", async () => {
    const { publicKey, privateKey } = await generateKeyPair(ALG, { extractable: true });
    const pkcs8 = await exportPKCS8(privateKey);
    const publicJwk = await exportJWK(publicKey);
    const kid = randomUUID();
    publicJwk.kid = kid;
    publicJwk.alg = ALG;
    publicJwk.use = "sig";

    // Encrypted-at-rest roundtrip — same encryptValue/decryptValue the
    // signing-key module calls. The stored row carries `value` + `nonce`.
    const { value, nonce } = await encryptValue(AAD, pkcs8);
    const unwrappedPem = await decryptValue(AAD, nonce, value);
    assert.equal(unwrappedPem, pkcs8, "unwrapped PEM must round-trip exactly");

    // The unwrapped PEM must reimport into a usable signing key.
    const unwrappedPriv = (await importPKCS8(unwrappedPem, ALG)) as KeyLike;

    // Mint a JWT with the unwrapped key.
    const token = await new SignJWT({
      email: "alice@example.com",
      project_id: "00000000-0000-0000-0000-000000000000",
      scope: "projects:rw",
      client_id: "lmnr-cli",
    })
      .setProtectedHeader({ alg: ALG, typ: "JWT", kid })
      .setSubject("11111111-1111-1111-1111-111111111111")
      .setIssuer("http://localhost:3010")
      .setAudience("lmnr-app-server")
      .setIssuedAt()
      .setExpirationTime("1h")
      .setJti(randomUUID())
      .sign(unwrappedPriv);

    // Verify via the same primitive `/oauth/jwks` consumers use.
    const jwks: JWK[] = [publicJwk];
    const keyset = createLocalJWKSet({ keys: jwks });
    const { payload } = await jwtVerify(token, keyset, {
      issuer: "http://localhost:3010",
      audience: "lmnr-app-server",
      algorithms: [ALG],
    });

    assert.equal(payload.sub, "11111111-1111-1111-1111-111111111111");
    assert.equal(payload.email, "alice@example.com");
    assert.equal(payload.project_id, "00000000-0000-0000-0000-000000000000");
    assert.equal(payload.scope, "projects:rw");
    assert.equal(payload.iss, "http://localhost:3010");
    assert.equal(payload.aud, "lmnr-app-server");
  });

  it("rejects a JWT signed by an unrelated keypair", async () => {
    const { publicKey: pubA } = await generateKeyPair(ALG, { extractable: true });
    const { privateKey: privB } = await generateKeyPair(ALG, { extractable: true });
    const publicJwkA = await exportJWK(pubA);
    const kid = randomUUID();
    publicJwkA.kid = kid;
    publicJwkA.alg = ALG;
    publicJwkA.use = "sig";

    const forged = await new SignJWT({ email: "mallory@example.com" })
      .setProtectedHeader({ alg: ALG, typ: "JWT", kid })
      .setSubject("22222222-2222-2222-2222-222222222222")
      .setIssuer("http://localhost:3010")
      .setAudience("lmnr-app-server")
      .setIssuedAt()
      .setExpirationTime("1h")
      .setJti(randomUUID())
      .sign(privB);

    const keyset = createLocalJWKSet({ keys: [publicJwkA] });
    await assert.rejects(
      jwtVerify(forged, keyset, {
        issuer: "http://localhost:3010",
        audience: "lmnr-app-server",
        algorithms: [ALG],
      })
    );
  });
});
