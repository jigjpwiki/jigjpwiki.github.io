import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { preview, references } from "../src/model.mjs";
import { hash } from "../src/security.mjs";
import { readFiles as files, filePath } from "../src/github.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const snapshot = () => ({
  sha: "main-sha",
  tree: "main-tree",
  models: Object.fromEntries(
    files.map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(root, filePath(name)))),
    ]),
  ),
});
async function input(s, action = "save", value, id = "tal-000001", extra = {}) {
  const proof = value ?? {
    action,
    id,
    targetId: extra.targetId ?? null,
    collection: extra.collection ?? null,
  };
  return {
    sha: s.sha,
    entity: "talent",
    action,
    id,
    ...(value !== undefined ? { value } : {}),
    ...extra,
    reason: "公式情報と照合して確認",
    evidence: {
      status: "verified",
      url: s.models.talents.sources.find((s) => s.id === "src-mahiru-neru").url,
      checkedAt: new Date().toISOString(),
      valueHash: await hash(proof),
    },
  };
}
test("edit validates all related masters, detects stale confirmation and stable identity", async () => {
  const s = snapshot(),
    value = structuredClone(s.models.talents.talents[0]);
  value.displayName += "（確認）";
  const request = await input(s, "save", value);
  const plan = await preview(s, request, { actor: "123" });
  assert.equal(plan.files.talents.talents[0].id, "tal-000001");
  assert(!plan.files["talent-id-registry"]);
  assert(plan.impact.references.length > 0);
  const stale = structuredClone(request);
  stale.value.displayName += "変更";
  await assert.rejects(preview(s, stale), /confirmation/);
  const bad = structuredClone(request);
  bad.value.accounts[0].accountId = "UC" + "x".repeat(22);
  bad.evidence.valueHash = await hash(bad.value);
  await assert.rejects(preview(s, bad), /validation/);
});
test("new identity issues next reserved ID, handles same names and unknown states, validates sources", async () => {
  const s = snapshot(),
    value = structuredClone(s.models.talents.talents[0]);
  delete value.id;
  value.accounts = [];
  value.affiliations = [];
  value.agencyStatus = { value: "unknown", sourceRefs: [] };
  value.activityStatus = { value: "unknown", sourceRefs: [] };
  value.wiki = null;
  value.profileImage = null;
  value.displayNameSourceRefs = ["src-fixture-new"];
  const req = await input(s, "save", value, undefined);
  delete req.id;
  req.sources = [
    {
      id: "src-fixture-new",
      kind: "official",
      url: "https://official.example/second-person",
      checkedAt: new Date().toISOString(),
    },
  ];
  req.evidence.url = req.sources[0].url;
  const plan = await preview(s, req, { actor: "123" });
  assert.equal(plan.files.talents.talents.length, 98);
  assert.equal(plan.files.talents.talents.at(-1).id, "tal-000098");
  assert.equal(plan.files["talent-id-registry"].issued.at(-1).id, "tal-000098");
  value.accounts = s.models.talents.talents[0].accounts;
  const duplicate = await input(s, "save", value);
  delete duplicate.id;
  duplicate.sources = req.sources;
  duplicate.evidence.url = req.sources[0].url;
  await assert.rejects(
    preview(s, duplicate),
    /duplicate account|identity_already_reserved/,
  );
});
test("delete/hide preserve referenced history; destructive action requires exact name/id", async () => {
  const s = snapshot();
  assert(references(s.models, "tal-000001").length);
  let req = await input(s, "delete", undefined);
  await assert.rejects(preview(s, req), /confirmation_name/);
  req.confirm = "tal-000001 真昼ねる";
  await assert.rejects(preview(s, req), /references_prevent/);
  req = await input(s, "visibility", "draft");
  req.confirm = "tal-000001 真昼ねる";
  await assert.rejects(preview(s, req), /references_prevent_hiding/);
});
test("collection exclusion is independent of visibility, never mutates collectors or caches", async () => {
  const s = snapshot(),
    req = await input(s, "collection", undefined, "tal-000001", {
      collection: "exclude",
      confirm: "tal-000001 真昼ねる",
    });
  const plan = await preview(s, req, { actor: "123" });
  assert(plan.files.youtube_streamers);
  assert(plan.files.twitch_streamers);
  assert(!plan.files.talents);
  assert(!Object.keys(plan.files).some((k) => k.includes("cache")));
});
test("org/group deletion with references and arbitrary operation/file fields are refused", async () => {
  const s = snapshot();
  const req = await input(s);
  req.entity = "organization";
  req.action = "delete";
  req.id = "org-000001";
  req.confirm = "org-000001 ProForma Nova";
  await assert.rejects(preview(s, req), /references_prevent/);
  await assert.rejects(
    preview(s, { ...req, path: "main" }),
    /invalid_operation/,
  );
});
function addIsolated(s, n) {
  const id = "tal-" + String(n).padStart(6, "0"),
    source = {
      id: "src-fixture-" + n,
      kind: "official",
      url: "https://official.example/person/" + n,
      checkedAt: new Date().toISOString(),
    };
  s.models.talents.sources.push(source);
  const t = {
    id,
    displayName: "検証専用" + n,
    displayNameSourceRefs: [source.id],
    aliases: [],
    affiliations: [],
    agencyStatus: { value: "unknown", sourceRefs: [] },
    activityStatus: { value: "unknown", sourceRefs: [] },
    accounts: [],
    wiki: null,
    profileImage: null,
  };
  s.models.talents.talents.push(t);
  s.models["talent-id-registry"].issued.push({
    id,
    youtubeChannelId: null,
    officialProfileUrl: source.url,
  });
  return t;
}
test("isolated hide/delete retain issued IDs; explicit merge removes only source and rewires references", async () => {
  for (const action of ["delete", "visibility", "merge"]) {
    const s = snapshot(),
      target = addIsolated(s, 98),
      source = addIsolated(s, 99);
    const req = await input(
      s,
      action,
      action === "visibility" ? "draft" : undefined,
      source.id,
      {
        confirm: source.id + " " + source.displayName,
        ...(action === "merge" ? { targetId: target.id } : {}),
      },
    );
    const p = await preview(s, req, { actor: "123" });
    assert.equal(
      p.files.talents.talents.length,
      action === "visibility" ? 99 : 98,
    );
    assert(p.files.talents.talents.some((t) => t.id === target.id));
    assert(p.files.talents.talents.some((t) => t.id === "tal-000097"));
    assert(!p.files["talent-id-registry"]);
    if (action === "merge")
      assert(
        p.files.talents.talents
          .find((t) => t.id === target.id)
          .aliases.some((a) => a.name === source.displayName),
      );
  }
});
test("an invalid cross-master reference blocks unrelated talent edits", async () => {
  const s = snapshot();
  s.models.events.events[0].talentIds.push("tal-999999");
  const value = structuredClone(s.models.talents.talents[0]);
  value.displayName += "確認";
  await assert.rejects(preview(s, await input(s, "save", value)), /validation/);
});
test("unchanged saves cannot create audit-only PRs or bypass fresh verification", async () => {
  const s = snapshot();
  const value = structuredClone(s.models.talents.talents[0]);
  const request = await input(s, "save", value);
  await assert.rejects(preview(s, request, { actor: "123" }), /no_changes/);
  delete request.evidence;
  await assert.rejects(preview(s, request, { actor: "123" }), /confirmation/);
});
