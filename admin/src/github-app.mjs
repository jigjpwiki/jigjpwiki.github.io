import { b64, fail } from "./security.mjs";
import { GitHub, repository } from "./github.mjs";

export function publishingEnabled(env) {
  return env.CMS_PUBLISH_ENABLED === "true" && /^\d+$/.test(env.CMS_GITHUB_APP_ID || "") &&
    /^\d+$/.test(env.CMS_GITHUB_INSTALLATION_ID || "") && !!env.CMS_GITHUB_APP_KEY;
}

export async function installationClient(env, transport) {
  if (!publishingEnabled(env)) fail(503, "cms_publish_disabled");
  const now = Math.floor(Date.now() / 1000);
  const bytes = new TextEncoder();
  const encode = (value) => b64(bytes.encode(JSON.stringify(value)));
  const payload = encode({ alg: "RS256", typ: "JWT" }) + "." +
    encode({ iss: env.CMS_GITHUB_APP_ID, iat: now - 30, exp: now + 300 });
  let signature;
  try {
    const pem = env.CMS_GITHUB_APP_KEY.trim();
    if (!pem.startsWith("-----BEGIN PRIVATE KEY-----")) throw Error();
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (char) => char.charCodeAt(0));
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("pkcs8", der, algorithm, false, ["sign"]);
    signature = b64(new Uint8Array(await crypto.subtle.sign(algorithm, key, bytes.encode(payload))));
  } catch {
    fail(503, "cms_app_key_invalid");
  }
  const app = new GitHub(payload + "." + signature, transport);
  const result = await app.call("/app/installations/" + env.CMS_GITHUB_INSTALLATION_ID + "/access_tokens", "POST", {
    repositories: [repository.split("/")[1]],
    permissions: { contents: "write", actions: "read" },
  });
  if (typeof result.token !== "string" || !result.token) fail(503, "cms_app_token_invalid");
  return new GitHub(result.token, transport);
}
