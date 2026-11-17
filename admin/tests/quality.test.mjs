import test from "node:test";
import assert from "node:assert/strict";
import {
  projectionCache,
  referenceIndex,
  referenceModels,
} from "../public/row-projection.js";
import { prepareChanges, prepareCurrentChanges } from "../public/data-table.js";
import { columnsFor, anniversaryDate } from "../public/table-columns.js";
import { WorkspaceStore } from "../src/workspace.mjs";
import { Workspace } from "../public/workspace.js";
import { random } from "../src/security.mjs";
import { snapshot } from "./content-fixtures.mjs";
import { planSubmission } from "../src/submission-plan.mjs";
import { hash } from "../src/security.mjs";
test("projection/index reuse never crosses a workspace mutation and retains all temporary identities", () => {
  let calls = 0;
  const c = projectionCache((t) => {
    calls++;
    return [{ id: t + "-1", _reference: "@new", youtubeId: "abcdefghijk" }];
  });
  const a = c.get("song");
  assert.equal(c.get("song"), a);
  assert.equal(calls, 1);
  assert.equal(referenceIndex(a).get("@new"), a[0]);
  c.clear();
  assert.notEqual(c.get("song"), a);
  assert.equal(calls, 2);
});
test("bulk preparation rejects the entire change set and reports row/field; source values stay untouched", () => {
  const rows = [
      { id: "one", amount: 10 },
      { id: "two", amount: 20 },
    ],
    before = structuredClone(rows);
  let accepted = false;
  const c = {
    label: "価格",
    parse: Number,
    set(r, v) {
      if (r.id === "two") throw Error("invalid");
      r.amount = v;
    },
  };
  assert.throws(() => {
    const changes = prepareChanges(rows, c, "42");
    accepted = true;
  }, /two.*価格/);
  assert.equal(accepted, false);
  assert.deepEqual(rows, before);
});
test("incomplete Anniversary drafts render without invented date/year and small confirmed years roundtrip", () => {
  const s = snapshot(),
    cols = columnsFor("anniversary", { models: s.models });
  const date = cols.find((c) => c.key === "date");
  assert.doesNotThrow(() => date.get({}));
  const r = { date: { year: 1, month: 1, day: 1 } };
  assert.deepEqual(anniversaryDate(date.get(r)), r.date);
  assert.equal(anniversaryDate("02-29").year, null);
});
test("1/20/60/120 operations survive restart, owner separation, 30-day expiry and capacity refusal without partial writes", async () => {
  const data = new Map(),
    store = {
      get: async (k) => data.get(k),
      put: async (k, v) => data.set(k, v),
    },
    key = random(),
    w = new WorkspaceStore(store, key);
  let revision = 0;
  for (const count of [1, 20, 60, 120]) {
    const ops = Array.from({ length: count }, (_, i) => ({
      key: "record-" + i,
      entity: "campaign",
      before: null,
      baseCommit: "main-sha",
      value: { title: "容量試験 " + i, visibility: "draft" },
    }));
    const now = Date.now(),
      result = await w.save("123", { protocol: 1, revision, operations: ops });
    revision = result.revision;
    assert.equal(
      (await new WorkspaceStore(store, key).get("123")).operations.length,
      count,
    );
    assert(result.expiresAt >= now + 30 * 86400000);
    assert.equal(await w.get("456"), null);
  }
  const before = await w.get("123");
  await assert.rejects(
    w.save("123", {
      protocol: 1,
      revision,
      operations: Array.from({ length: 121 }, (_, i) => ({
        ...before.operations[0],
        key: "bad-" + i,
        validationState: undefined,
      })).map(({ validationState, ...v }) => v),
    }),
    /operation_limit/,
  );
  assert.deepEqual(await w.get("123"), before);
  const big = structuredClone(before.operations[0]);
  delete big.validationState;
  big.value.title = "x".repeat(524288);
  await assert.rejects(
    w.save("123", { protocol: 1, revision, operations: [big] }),
    /size_limit/,
  );
  assert.deepEqual(await w.get("123"), before);
});
test("client retains edited values for 401/429/503/network errors and CAS refuses blind overwrite", async () => {
  for (const code of [
    "login_required",
    "rate_limit",
    "temporary_failure",
    "network",
    "workspace_revision_conflict",
  ]) {
    const w = new Workspace(
        async () => {
          const e = Error(code);
          e.code = code;
          throw e;
        },
        () => {},
        600000,
      ),
      op = {
        key: "record",
        entity: "campaign",
        before: null,
        baseCommit: "main",
        value: { title: "未送信", visibility: "draft" },
      };
    w.state = "saved";
    w.replace([op]);
    await assert.rejects(w.save());
    assert.deepEqual(w.operations, [op]);
    assert.equal(
      w.state,
      code === "workspace_revision_conflict" ? "conflict" : "failed",
    );
    clearTimeout(w.timer);
  }
});
test("120 typed new records validate/allocate atomically while 121 cannot bypass operation limit", async () => {
  const s = snapshot(),
    ops = Array.from({ length: 120 }, (_, i) => ({
      entity: "campaign",
      key: "campaign-" + i,
      baseCommit: s.sha,
      before: null,
      value: { title: "品質fixture " + i, visibility: "draft" },
    }));
  const p = await planSubmission(s, ops, {
    actor: "123",
    batchId: await hash("capacity"),
  });
  assert.equal(
    p.files["audit:" + (await hash("capacity"))].operations.length,
    120,
  );
  assert.equal(
    new Set(
      p.files["audit:" + (await hash("capacity"))].operations.map(
        (o) => o.recordId,
      ),
    ).size,
    120,
  );
  assert.equal(
    p.files.goods.campaigns.length,
    s.models.goods.campaigns.length + 120,
  );
  await assert.rejects(
    planSubmission(s, [...ops, { ...ops[0], key: "excess" }], {
      actor: "123",
      batchId: await hash("excess"),
    }),
    /operation_limit/,
  );
  assert.equal(
    s.models.goods.campaigns.some((c) => c.title.startsWith("品質fixture")),
    false,
  );
});

test("a bulk confirmation cannot overwrite intervening local edits or deleted rows", () => {
  const before = [
      { id: "a", title: "A", visibility: "public" },
      { id: "b", title: "B", visibility: "public" },
    ],
    field = {
      label: "公開状態",
      options: [["draft", "非公開"]],
      set: (r, v) => (r.visibility = v),
    };
  const current = structuredClone(before);
  current[1].title = "new";
  assert.throws(
    () => prepareCurrentChanges(before, current, field, "draft"),
    /確認中/,
  );
  assert.equal(current[1].title, "new");
  assert.throws(
    () => prepareCurrentChanges(before, current.slice(0, 1), field, "draft"),
    /確認中/,
  );
  assert.equal(prepareCurrentChanges(before, before, field, "draft").length, 2);
});

test("cross-category pickers see saved/temporary labels without corrupting baselines or issuing IDs", () => {
  const s = snapshot(),
    before = structuredClone(s.models),
    operations = [
      {
        entity: "talent",
        key: "new-talent",
        value: { displayName: "新規名", visibility: "draft" },
      },
      {
        entity: "organization",
        id: s.models.talents.organizations[0].id,
        value: { ...s.models.talents.organizations[0], name: "編集名" },
      },
    ];
  const view = referenceModels(s.models, operations);
  assert.equal(view.talents.talents.at(-1).id, "@new-talent");
  assert.equal(view.talents.organizations[0].name, "編集名");
  assert.deepEqual(s.models, before);
  assert.equal(operations[0].value.id, undefined);
});
