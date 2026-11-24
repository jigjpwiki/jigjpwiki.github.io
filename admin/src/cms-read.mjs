import { fail } from "./security.mjs";
import { repository } from "./github.mjs";

const files = ["talents", "catalog", "anniversaries", "music", "media", "karaoke", "events", "goods", "talent-id-registry", "catalog-id-registry", "feature-id-registry", "youtube_streamers", "twitch_streamers", "youtube"];

export function createCmsReader(transport) {
  let cached;
  let pending;
  async function read(url) {
    try {
      const response = await transport(url, { signal: AbortSignal.timeout(8000), redirect: "error", headers: { "User-Agent": "jigwiki-admin" } });
      if (!response.ok) fail(503, "cms_read_unavailable");
      return await response.json();
    } catch {
      fail(503, "cms_read_unavailable");
    }
  }
  return async function snapshot({ revalidate = false } = {}) {
    if (!revalidate && cached?.expires > Date.now()) return cached.models;
    if (!pending) {
      pending = (async () => {
        const ref = await read("https://api.github.com/repos/" + repository + "/git/ref/heads/main");
        const sha = ref.object?.sha;
        if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) fail(503, "cms_read_unavailable");
        if (cached?.models.sha === sha) {
          cached.expires = Date.now() + 60000;
          return cached.models;
        }
        const base = "https://raw.githubusercontent.com/" + repository + "/" + sha + "/data/";
        const models = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await read(base + name + ".json")])));
        models["admin-ledger"] = { version: 1, entries: [] };
        cached = { models: { sha, models }, expires: Date.now() + 60000 };
        return cached.models;
      })().finally(() => { pending = null; });
    }
    return pending;
  };
}
