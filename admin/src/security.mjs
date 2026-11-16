export class Failure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
export const fail = (status, code) => {
  throw new Failure(status, code);
};
export const random = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return b64(b);
};
export const b64 = (b) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const unb64 = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export const hash = async (v) =>
  b64(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v)),
      ),
    ),
  );
export const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export const cookies = (request) =>
  Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((s) => s.trim().split("=")),
  );
export async function seal(value, secret) {
  const key = unb64(secret || "");
  if (key.length !== 32) fail(503, "session_configuration");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
  ]);
  return (
    b64(iv) +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          aes,
          new TextEncoder().encode(JSON.stringify(value)),
        ),
      ),
    )
  );
}
export async function open(value, secret) {
  try {
    const [a, b] = value.split(".");
    const aes = await crypto.subtle.importKey(
      "raw",
      unb64(secret),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(a) },
          aes,
          unb64(b),
        ),
      ),
    );
  } catch {
    fail(401, "invalid_session");
  }
}
export async function body(request, max = 100000) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    fail(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "body_required");
  let size = 0,
    parts = [];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "payload_limit");
    }
    parts.push(r.value);
  }
  try {
    const bytes = new Uint8Array(size);
    let n = 0;
    for (const p of parts) {
      bytes.set(p, n);
      n += p.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "invalid_json");
  }
}
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
export function allow(user, env) {
  if (
    !env.ADMIN_USER_IDS?.split(",")
      .map((s) => s.trim())
      .includes(String(user.id))
  )
    fail(403, "administrator_not_allowed");
}
export function csrf(request, session) {
  if (
    request.headers.get("Origin") !== new URL(request.url).origin ||
    request.headers.get("X-CSRF-Token") !== session.csrf
  )
    fail(403, "csrf_rejected");
}
