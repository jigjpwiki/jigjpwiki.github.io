import test from "node:test";
import assert from "node:assert/strict";
import { b64 } from "../src/security.mjs";
import { verifyGoogle, googleAuth, googleControlsEmail } from "../src/google.mjs";

test("Google claims must be signed, intended for this client and bound to the verified invitation identity", async () => {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
  const pair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const keys = [{ ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "fixture" }];
  const encoder = new TextEncoder();
  const encode = (value) => b64(encoder.encode(JSON.stringify(value)));
  const now = Date.now();
  const claims = { iss: "https://accounts.google.com", aud: "client", nonce: "nonce", iat: now / 1000, exp: now / 1000 + 60, sub: "1234", email: "editor@example.test", email_verified: true };
  async function sign(fields) {
    const message = encode({ alg: "RS256", kid: "fixture" }) + "." + encode(fields);
    return message + "." + b64(new Uint8Array(await crypto.subtle.sign(algorithm, pair.privateKey, encoder.encode(message))));
  }
  const valid = await sign(claims);
  assert.equal((await verifyGoogle(valid, "client", "nonce", keys, now)).sub, "1234");
  for (const patch of [{ aud: "another" }, { nonce: "wrong" }, { email_verified: false }, { exp: 0 }, { iss: "https://example.test" }])
    await assert.rejects(verifyGoogle(await sign({ ...claims, ...patch }), "client", "nonce", keys, now), /google_identity_invalid/);
  const [head, , signature] = valid.split(".");
  await assert.rejects(verifyGoogle(head + "." + encode({ ...claims, sub: "changed" }) + "." + signature, "client", "nonce", keys, now), /google_identity_invalid/);
});

test("a Google callback without matching browser state cannot contact Google", async () => {
  const origin = "https://admin.example.test";
  await assert.rejects(googleAuth(
    new Request(origin + "/auth/google/callback?state=unknown&code=fixture"),
    { GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "fixture", GOOGLE_ADMIN_ORIGIN: origin },
    {}, () => assert.fail("external request"), Date.now(), (callback) => callback(),
  ), /oauth_state_invalid/);
});


test("only Google-managed mailbox addresses can claim invitations", () => {
  assert.equal(googleControlsEmail({ email: "a@gmail.com" }), true);
  assert.equal(googleControlsEmail({ email: "a@example.test", hd: "example.test" }), true);
  assert.equal(googleControlsEmail({ email: "a@example.test", hd: "other.test" }), false);
  assert.equal(googleControlsEmail({ email: "a@example.test" }), false);
});
