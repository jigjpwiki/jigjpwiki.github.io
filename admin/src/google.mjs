import { fail, hash, random, unb64, cookie, cookies, headers, seal, open, sessionLifetimeMs, sessionLifetimeSeconds } from "./security.mjs";

const issuer = "https://accounts.google.com";
export const emailKey = async (email) => "member:" + await hash(email.trim().toLowerCase());
const decode = (value) => JSON.parse(new TextDecoder().decode(unb64(value)));

export async function verifyGoogle(token, audience, nonce, keys, now) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw Error();
    const [head, payload, signature] = parts;
    const header = decode(head), claims = decode(payload);
    const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (header.alg !== "RS256" || !jwk) throw Error();
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);
    if (!await crypto.subtle.verify(algorithm, key, unb64(signature), new TextEncoder().encode(head + "." + payload))) throw Error();
    const seconds = now / 1000;
    if (
      ![issuer, "accounts.google.com"].includes(claims.iss) ||
      claims.aud !== audience || claims.azp && claims.azp !== audience ||
      !Number.isFinite(claims.exp) || claims.exp <= seconds ||
      !Number.isFinite(claims.iat) || claims.iat > seconds + 60 ||
      claims.nonce !== nonce || claims.email_verified !== true ||
      typeof claims.email !== "string" || !claims.email.includes("@") ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255
    ) throw Error();
    return claims;
  } catch {
    fail(403, "google_identity_invalid");
  }
}

export const googleEnabled = (env) => env.GOOGLE_AUTH_ENABLED === "true" &&
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_ADMIN_ORIGIN);

export function googleControlsEmail(claims) {
  const domain = claims.email.toLowerCase().split("@").at(-1);
  return domain === "gmail.com" || (
    typeof claims.hd === "string" && claims.hd.toLowerCase() === domain
  );
}

async function googleResponse(transport, url, options, failure) {
  let response;
  try {
    response = await transport(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(8000) });
  } catch {
    fail(503, "google_unavailable");
  }
  if (!response.ok) fail(response.status === 400 && failure === "google_exchange_failed" ? 403 : 503, failure);
  try {
    return await response.json();
  } catch {
    fail(503, "google_response_invalid");
  }
}

export async function googleAuth(request, env, store, transport, now, atomic) {
  const url = new URL(request.url);
  if (!googleEnabled(env)) fail(404, "google_disabled");
  if (url.protocol !== "https:" || url.origin !== env.GOOGLE_ADMIN_ORIGIN) fail(400, "google_origin_invalid");
  const redirect = url.origin + "/auth/google/callback";
  const secureHeaders = new Headers(headers);
  const stateCookie = "__Host-admin-google";
  if (url.pathname === "/auth/google/login") {
    await atomic(async () => {
      const key = "google-login-budget";
      const count = (await store.get(key)) || 0;
      if (count >= 60) fail(429, "google_login_limit");
      await store.put(key, count + 1, (Math.floor(now / 60000) + 1) * 60000);
    });
    const state = random(), verifier = random(), nonce = random();
    await store.put("google-oauth:" + state, { verifier, nonce }, now + 300_000);
    const authorize = new URL(issuer + "/o/oauth2/v2/auth");
    authorize.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code",
      scope: "openid email", state, nonce, code_challenge: await hash(verifier), code_challenge_method: "S256",
    });
    secureHeaders.set("Location", authorize.href);
    secureHeaders.append("Set-Cookie", cookie(stateCookie, state, 300));
    return new Response(null, { status: 302, headers: secureHeaders });
  }
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!code || !state || !/^[\w-]{43}$/.test(state) || cookies(request)[stateCookie] !== state) fail(403, "oauth_state_invalid");
  const saved = await atomic(async () => {
    const value = await store.get("google-oauth:" + state);
    if (!value) fail(403, "oauth_state_invalid");
    await store.delete("google-oauth:" + state);
    return value;
  });
  const result = await googleResponse(transport, "https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "manual",
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect, code_verifier: saved.verifier, grant_type: "authorization_code", code,
    }),
  }, "google_exchange_failed");
  const jwks = await googleResponse(transport, "https://www.googleapis.com/oauth2/v3/certs", {}, "google_keys_unavailable");
  const identity = await verifyGoogle(result.id_token, env.GOOGLE_CLIENT_ID, saved.nonce, jwks.keys, now);
  // Google cannot attest current mailbox ownership for consumer accounts with external mail.
  if (!googleControlsEmail(identity)) fail(403, "google_mailbox_unverified");
  const memberKey = await emailKey(identity.email);
  const member = await atomic(async () => {
    const entry = await store.get(memberKey);
    if (!entry) fail(403, "google_invitation_required");
    const value = await open(entry, env.SESSION_KEY);
    if (value.disabled || (value.sub && value.sub !== identity.sub) ||
        (!value.sub && value.expires <= now)) fail(403, "google_invitation_required");
    if (!value.sub) {
      value.sub = identity.sub;
      await store.put(memberKey, await seal(value, env.SESSION_KEY), Number.MAX_SAFE_INTEGER);
    }
    return value;
  });
  const session = { id: member.id, provider: "google", memberKey, revision: member.revision, csrf: random(), expires: Date.now() + sessionLifetimeMs };
  const id = random();
  await store.put("session:" + id, session, session.expires);
  secureHeaders.set("Location", url.origin + "/");
  secureHeaders.append("Set-Cookie", cookie("__Host-admin-session", id, sessionLifetimeSeconds));
  secureHeaders.append("Set-Cookie", cookie(stateCookie, "", 0));
  return new Response(null, { status: 302, headers: secureHeaders });
}
