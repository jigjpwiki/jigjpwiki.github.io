import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceStore, workspaceOperations } from "../src/workspace.mjs";
import { Workspace, withoutSubmitted } from "../public/workspace.js";
import { random } from "../src/security.mjs";
const op = (i = 1) => ({
  key: "record-" + i,
  entity: "campaign",
  baseCommit: "main-sha",
  before: null,
  value: { title: "下書き " + i, visibility: "draft" },
});
function storage() {
  const map = new Map();
  return {
    map,
    get: async (k) => map.get(k),
    put: async (k, v) => map.set(k, v),
  };
}
test("encrypted owner-separated persistent workspace, revision CAS, 20 mixed edits and unchanged baseline", async () => {
  const store = storage(),
    secret = random(),
    w = new WorkspaceStore(store, secret);
  const operations = Array.from({ length: 20 }, (_, i) =>
    i % 2
      ? op(i)
      : { ...op(i), entity: "organization", value: { name: "事務所 " + i } },
  );
  const before = structuredClone(operations);
  const first = await w.save("123", { protocol: 1, revision: 0, operations });
  assert.equal(first.operations.length, 20);
  assert.equal(first.revision, 1);
  assert.deepEqual(operations, before);
  assert.ok(!JSON.stringify([...store.map.values()]).includes("下書き"));
  assert.equal(await w.get("456"), null);
  assert.deepEqual(await new WorkspaceStore(store, secret).get("123"), first);
  await assert.rejects(
    w.save("123", { protocol: 1, revision: 0, operations }),
    /workspace_revision_conflict/,
  );
  assert.deepEqual(await w.get("123"), first);
  await w.save("456", { protocol: 1, revision: 0, operations: [op()] });
  assert.equal((await w.get("123")).operations.length, 20);
});
test("incomplete drafts cannot become validated masters; fixed identity, dangerous metadata and limits rejected", async () => {
  assert.equal(workspaceOperations([op()])[0].validationState, "unchecked");
  for (const bad of [
    { ...op(), ownerId: "456" },
    { ...op(), entity: "files" },
    { ...op(), value: { title: "x", token: "secret" } },
    { ...op(), value: { title: "x", access_token: "secret" } },
    { ...op(), value: null },
    {
      ...op(),
      before: { id: "campaign-000001", title: "old" },
      id: "campaign-000002",
    },
    {
      ...op(),
      parent: { entity: "campaign", reference: "x", token: "secret" },
    },
  ])
    assert.throws(() => workspaceOperations([bad]));
  assert.throws(() => workspaceOperations([op(), op()]), /workspace_operation/);
  assert.throws(
    () => workspaceOperations(Array.from({ length: 121 }, (_, i) => op(i))),
    /workspace_operation_limit/,
  );
  const v = op();
  v.value.title = "x".repeat(524288);
  await assert.rejects(
    new WorkspaceStore(storage(), random()).save("123", {
      protocol: 1,
      revision: 0,
      operations: [v],
    }),
    /workspace_size_limit/,
  );
});
test("client preserves in-flight edits, retry on failure, Undo/Redo and explicit conflict recovery", async () => {
  let release,
    fail = false,
    conflict = false,
    saved = [];
  const api = async (p, method, value) => {
    if (!method) return { workspace: { revision: 0, operations: [] } };
    if (fail) throw new Error("offline");
    if (conflict) {
      const e = new Error("conflict");
      e.code = "workspace_revision_conflict";
      throw e;
    }
    saved = value.operations;
    await new Promise((r) => (release = r));
    return { workspace: { revision: value.revision + 1 } };
  };
  const c = new Workspace(api, () => {}, 100000);
  await c.load();
  c.upsert(op());
  const saving = c.save();
  c.upsert(op(2));
  release();
  await saving;
  assert.equal(c.state, "unsaved");
  assert.equal(c.operations.length, 2);
  assert.equal(saved.length, 1);
  c.history("undo");
  assert.equal(c.operations.length, 1);
  c.history("redo");
  assert.equal(c.operations.length, 2);
  fail = true;
  await assert.rejects(c.save());
  assert.equal(c.state, "failed");
  assert.equal(c.operations.length, 2);
  fail = false;
  conflict = true;
  await assert.rejects(c.save());
  assert.equal(c.state, "conflict");
  c.upsert(op(3));
  assert.equal(c.state, "conflict");
  await assert.rejects(c.save());
  clearTimeout(c.timer);
});

test("expired drafts are not restored; new protocol and injected credentials never replace existing drafts", async () => {
  const store = storage(),
    secret = random(),
    w = new WorkspaceStore(store, secret);
  const first = await w.save("123", {
    protocol: 1,
    revision: 0,
    operations: [op()],
  });
  await assert.rejects(
    w.save("123", { protocol: 2, revision: 1, operations: [] }),
    /workspace_protocol/,
  );
  assert.deepEqual(await w.get("123"), first);
  const { seal } = await import("../src/security.mjs");
  store.map.set("workspace-v1:123", {
    encrypted: await seal({ ...first, expiresAt: Date.now() - 1 }, secret),
  });
  assert.equal(await w.get("123"), null);
});

test("submitting one new draft retains identical new drafts and edits made after preview", () => {
  const one = op(1),
    two = op(2);
  two.value = structuredClone(one.value);
  assert.deepEqual(withoutSubmitted([one, two], [one]), [two]);
  assert.deepEqual(
    withoutSubmitted([one, two], [{ entity: one.entity, value: one.value }]),
    [one, two],
  );
  assert.deepEqual(
    withoutSubmitted(
      [{ ...one, value: { ...one.value, title: "edited after preview" } }, two],
      [one],
    ).length,
    2,
  );
});
