import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { inspectDraftConflicts } from "../src/cms-conflicts.mjs";

function setup() {
  const models = structuredClone(fixture);
  const before = structuredClone(models.events.events[0]);
  const latest = { ...before, title: "最新のイベント名", venue: "最新の会場" };
  models.events.events[0] = latest;
  return {
    snapshot: { sha: "current", models },
    member: { role: "editor", owner: true, scope: { categories: ["events"] } },
    operations: [{ key: "cms-event", entity: "event", id: before.id, before,
      baseCommit: "original", value: { ...before, title: "自分のイベント名", summary: "自分の概要" } }],
  };
}

test("conflict comparison identifies the exact field and merges disjoint main and draft edits", () => {
  const { snapshot, member, operations } = setup();
  const { conflicts } = inspectDraftConflicts(snapshot, member, operations);
  assert.deepEqual(conflicts.map(({ field, ours, theirs }) => ({ field, ours, theirs })), [
    { field: "/title", ours: "自分のイベント名", theirs: "最新のイベント名" },
  ]);
  const { resolved } = inspectDraftConflicts(snapshot, member, operations, ["theirs"]);
  assert.equal(resolved[0].value.title, "最新のイベント名");
  assert.equal(resolved[0].value.venue, "最新の会場");
  assert.equal(resolved[0].value.summary, "自分の概要");
  assert.equal(resolved[0].baseCommit, "current");
  assert.equal(resolved[0].before.title, "最新のイベント名");
  assert.equal(inspectDraftConflicts(snapshot, member, operations, ["ours"]).resolved[0].value.title,
    "自分のイベント名");
});

test("revoked roles and current record visibility prevent disclosure of comparison values", () => {
  const { snapshot, member, operations } = setup();
  assert.throws(() => inspectDraftConflicts(snapshot, { ...member, role: "viewer" }, operations), /cms_scope_denied/);
  assert.throws(() => inspectDraftConflicts(snapshot, member, operations, []), /cms_conflict_choice/);
  snapshot.models.events.events[0].visibility = "draft";
  assert.throws(() => inspectDraftConflicts(snapshot, member, operations), /cms_scope_denied/);
});
