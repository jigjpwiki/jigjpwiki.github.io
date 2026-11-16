import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createDraft,
  fieldChanges,
  validationIssues,
} from "../public/draft.js";
const talents = JSON.parse(
  fs.readFileSync(new URL("../../data/talents.json", import.meta.url)),
);
const catalog = JSON.parse(
  fs.readFileSync(new URL("../../data/catalog.json", import.meta.url)),
);
test("image editing, nullable URLs and repeated serialization preserve Wiki evidence and every other record", () => {
  const before = structuredClone(talents);
  for (const id of ["tal-000001", "tal-000004"]) {
    const original = talents.talents.find((t) => t.id === id),
      draft = createDraft(original);
    assert.equal(draft.dirty, false);
    const wiki = structuredClone(draft.value.wiki);
    draft.optionalUrl("profileImage", "https://example.com/new.png");
    draft.setOptionalRefs("profileImage", [original.displayNameSourceRefs[0]]);
    draft.optionalUrl("wiki", "");
    assert.equal(draft.value.wiki, null);
    draft.optionalUrl("wiki", wiki.url);
    assert.deepEqual(draft.value.wiki, wiki);
    const payload = JSON.parse(JSON.stringify(draft.payload()));
    assert.deepEqual(payload.wiki, original.wiki);
    assert.equal(payload.id, id);
    payload.accounts.push({ ...payload.accounts[0] });
    assert.notDeepEqual(payload, draft.value);
    assert.deepEqual(talents, before);
    assert.equal(draft.dirty, true);
  }
});
test("arrays, null and explicit source changes are detached and round-trip without coercion", () => {
  const original = talents.talents[0],
    draft = createDraft(original);
  draft.value.accounts.push({
    service: "twitch",
    accountId: null,
    url: "https://www.twitch.tv/fixture",
    sourceRefs: [],
  });
  draft.value.affiliations.push({
    organizationId: null,
    status: "unknown",
    from: null,
    to: null,
    sourceRefs: [],
  });
  draft.value.aliases.push({ name: "fixture", type: "alias", sourceRefs: [] });
  assert.equal(draft.payload().accounts.at(-1).accountId, null);
  assert.equal(draft.payload().affiliations.at(-1).organizationId, null);
  assert.equal(original.accounts.length + 1, draft.value.accounts.length);
  draft.optionalUrl("profileImage", "https://example.com/a.png");
  draft.setOptionalRefs("profileImage", []);
  assert.deepEqual(draft.payload().profileImage.sourceRefs, []); // no invented evidence
});
test("human diff groups image edits and distinguishes add/change/delete without mutating input", () => {
  const original = talents.talents[0],
    draft = createDraft(original);
  draft.value.displayName = "変更";
  draft.optionalUrl("profileImage", "https://example.com/new.png");
  const changes = fieldChanges(original, draft.payload());
  assert(changes.some((c) => c.path === "/displayName" && c.kind === "変更"));
  assert.equal(
    changes.filter((c) => c.path.startsWith("/profileImage")).length,
    1,
  );
  assert.equal(fieldChanges({ a: 1 }, {})[0].kind, "削除");
  assert.equal(fieldChanges({}, { a: 1 })[0].kind, "追加");
});
test("validation paths identify the actual record and editable field", () => {
  const [issue] = validationIssues(
    "validation: Invalid talent schema: /talents/3/wiki/sourceRefs must NOT have fewer than 1 items; /talents/3/wiki must be null",
    { talents, catalog },
    "tal-000001",
  );
  assert.equal(issue.recordId, "tal-000004");
  assert.equal(issue.external, true);
  assert.equal(issue.path, "/wiki/sourceRefs");
  assert.equal(issue.tab, "links");
  const [own] = validationIssues(
    "data/talents/3/wiki/sourceRefs must NOT have fewer than 1 items",
    { talents, catalog },
    "tal-000004",
  );
  assert.equal(own.external, false);
});
