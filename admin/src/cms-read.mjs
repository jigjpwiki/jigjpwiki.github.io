import { fail } from "./security.mjs";
import { repository } from "./github.mjs";

const files = ["talents", "catalog", "anniversaries", "music", "media", "karaoke", "events", "goods", "talent-id-registry", "catalog-id-registry", "feature-id-registry", "youtube_streamers", "twitch_streamers", "youtube"];
const concurrency = 4;

export function createCmsReader(transport) {
  let cached;
  // Log only fixed stages and HTTP status; never log credentials, responses or user data.
  function unavailable(stage, reason, status) {
    console.warn("cms_read_unavailable", { stage, reason, ...(status === undefined ? {} : { status }) });
    fail(503, "cms_read_unavailable");
  }
  async function read(url, stage, token) {
    let response;
    try {
      response = await transport(url, {
        signal: AbortSignal.timeout(12000), redirect: "error",
        headers: {
          "User-Agent": "jigwiki-admin",
          ...(token ? { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } : {}),
        },
      });
    } catch (error) {
      unavailable(stage, ["TimeoutError", "AbortError"].includes(error?.name) ? "timeout" : "transport");
    }
    if (!response.ok) {
      const status = response.status;
      // Release the connection even when the upstream returns an error.
      try { await response.body?.cancel(); } catch {}
      unavailable(stage, "http", status);
    }
    try { return await response.json(); }
    catch (error) {
      unavailable(stage, ["TimeoutError", "AbortError"].includes(error?.name) ? "timeout" : "invalid_json");
    }
  }
  async function readSnapshot(sha) {
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) unavailable("main_ref", "invalid_sha");
    const base = "https://raw.githubusercontent.com/" + repository + "/" + sha + "/data/";
    const models = {};
    // Bound concurrency per request and consume every response before the next batch.
    // Never send GitHub credentials to raw.githubusercontent.com.
    for (let i = 0; i < files.length; i += concurrency) {
      const results = await Promise.allSettled(files.slice(i, i + concurrency).map(async (name) =>
        [name, await read(base + name + ".json", name)]));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      for (const result of results) {
        const [name, value] = result.value;
        models[name] = value;
      }
    }
    models["admin-ledger"] = { version: 1, entries: [] };
    return { sha, models };
  }
  return async function snapshot({ revalidate = false, revision, getReadToken } = {}) {
    if (revision !== undefined) return cached?.models.sha === revision ? cached.models : readSnapshot(revision);
    if (!revalidate && cached?.expires > Date.now()) return cached.models;
    // Cache only completed immutable data. Do not share a pending fetch promise
    // across Durable Object request contexts. A write always checks the current ref.
    let token;
    try { token = await getReadToken?.(); }
    catch { unavailable("main_ref", "authentication"); }
    const ref = await read("https://api.github.com/repos/" + repository + "/git/ref/heads/main", "main_ref", token);
    const sha = ref.object?.sha;
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) unavailable("main_ref", "invalid_sha");
    if (cached?.models.sha === sha) {
      cached.expires = Date.now() + 60000;
      return cached.models;
    }
    const models = await readSnapshot(sha);
    cached = { models, expires: Date.now() + 60000 };
    return models;
  };
}
