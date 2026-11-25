import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { assertReversalRoundTrip, prepareAuditReversal, readCmsHistory, scopedHistory } from "../src/cms-history.mjs";

const batchId = "a".repeat(43);
const member = { role: "editor", owner: true, scope: { categories: ["events"] } };

function setup() {
  const models = structuredClone(fixture);
  const base = structuredClone(models.events.events[0]);
  const after = { ...base, title: "公開したイベント名" };
  const current = { ...after, venue: "別の編集者が更新した会場" };
  models.events.events[0] = current;
  const audit = {
    version: 2, batchId, actor: "1234", createdAt: "2026-11-24T00:00:00.000Z", baseCommit: "old",
    reason: null, branch: "admin/change-" + batchId,
    operations: [{ operationId: "event", entity: "event", recordId: base.id, action: "edit",
      changedFields: ["title"], before: base, after }],
  };
  return { snapshot: { sha: "b".repeat(40), models }, audit, current, base };
}

test("audit reversal keeps an unrelated later edit and refuses overwriting a later change in the same field", async () => {
  const { snapshot, audit, current, base } = setup();
  const op = prepareAuditReversal(snapshot, member, audit, batchId, "event", base.id);
  assert.equal(op.value.title, base.title);
  assert.equal(op.value.venue, current.venue);
  assert.equal(op.before.title, current.title);
  await assertReversalRoundTrip(snapshot, member, op);
  current.title = "後から同じ項目を変更";
  assert.throws(() => prepareAuditReversal(snapshot, member, audit, batchId, "event", base.id),
    /cms_history_reversal_conflict/);
});

test("scope hides history and editors cannot reverse untracked or visibility-changing operations", () => {
  const { snapshot, audit, base } = setup();
  const viewer = { role: "viewer", scope: { categories: ["goods"] } };
  assert.deepEqual(scopedHistory(snapshot, viewer, audit, batchId).operations, []);
  assert.throws(() => prepareAuditReversal(snapshot, viewer, audit, batchId, "event", base.id),
    /cms_scope_denied/);
  audit.operations[0].before.visibility = "draft";
  assert.throws(() => prepareAuditReversal(snapshot, member, audit, batchId, "event", base.id),
    /cms_history_reversal_unavailable/);
});

test("history loads only tracked paths pinned to the authorized snapshot SHA", async () => {
  const { snapshot, audit } = setup();
  const calls = [];
  const result = await readCmsHistory({
    snapshot, member, repository: "owner/repo",
    github: { async call(path) {
      assert.equal(path, "/repos/owner/repo/git/trees/" + snapshot.sha + "?recursive=1");
      return { tree: [
        { type: "blob", path: "data/events.json" },
        { type: "tree", path: "ops/admin/audit/" + "c".repeat(43) + ".json" },
        { type: "blob", path: "ops/admin/audit/" + batchId + ".json" },
      ] };
    } },
    transport: async (url) => {
      calls.push(url);
      return Response.json(audit);
    },
  });
  assert.deepEqual(result, { records: [{ batchId, actor: audit.actor, createdAt: audit.createdAt, count: 1 }], next: null });
  assert.deepEqual(calls, ["https://raw.githubusercontent.com/owner/repo/" + snapshot.sha + "/ops/admin/audit/" + batchId + ".json"]);
});

test("common editor can read organization history while legacy category restrictions still apply", () => {
  const models = structuredClone(fixture);
  const before = structuredClone(models.talents.organizations[0]);
  const after = { ...before, name: before.name + " 更新" };
  models.talents.organizations[0] = after;
  const audit = {
    version: 2, batchId, actor: "1234", createdAt: "2026-11-25T00:00:00.000Z", baseCommit: "old",
    reason: null, branch: "admin/change-" + batchId,
    operations: [{ operationId: "organization", entity: "organization", recordId: before.id, action: "edit",
      changedFields: ["name"], before, after }],
  };
  const snapshot = { sha: "b".repeat(40), models };
  const editor = { role: "editor", contentPolicy: "all-content-v1" };
  assert.equal(scopedHistory(snapshot, editor, audit, batchId).operations.length, 1);
  assert.equal(editor.owner, undefined);
  const scoped = { role: "editor", scope: { categories: ["events"], organizations: [before.id] } };
  assert.equal(scopedHistory(snapshot, scoped, audit, batchId).operations.length, 0);
});
