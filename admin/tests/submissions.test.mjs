import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFiles, filePath } from "../src/github.mjs";
import { hash, random } from "../src/security.mjs";
import { WorkspaceStore } from "../src/workspace.mjs";
import { Submissions } from "../src/submissions.mjs";
import { threeWay, planSubmission } from "../src/submission-plan.mjs";
import audit from "../src/audit.cjs";
const models = () =>
  Object.fromEntries(
    readFiles.map((n) => [
      n,
      JSON.parse(
        fs.readFileSync(new URL("../../" + filePath(n), import.meta.url)),
      ),
    ]),
  );
const edit = (m, entity, list, file, i = 0) => ({
  key: entity + "-" + i,
  entity,
  id: m[file][list][i].id,
  baseCommit: "main-sha",
  before: structuredClone(m[file][list][i]),
  value: structuredClone(m[file][list][i]),
});
function operations(m) {
  return Array.from({ length: 20 }, (_, i) => {
    if (i < 5) {
      const o = edit(m, "talent", "talents", "talents", i);
      o.value.displayName += " 編集";
      return o;
    }
    if (i < 10) {
      const o = edit(m, "anniversary", "events", "anniversaries", i - 5);
      o.value.title += " 編集";
      return o;
    }
    return {
      key: "campaign-" + i,
      entity: "campaign",
      baseCommit: "main-sha",
      before: null,
      value: { title: "下書き " + i, visibility: "draft" },
    };
  });
}
async function setup() {
  const map = new Map(),
    secret = random(),
    store = {
      get: async (k) => map.get(k),
      put: async (k, v) => map.set(k, structuredClone(v)),
      delete: async (k) => map.delete(k),
    };
  const original = models(),
    snap = { sha: "main-sha", tree: "tree", models: original },
    history = new Map([["main-sha", structuredClone(snap)]]),
    prs = new Map();
  let writes = 0,
    failure = false,
    lost = false,
    head = "commit-one",
    statusMode = "success",
    foreign = false;
  const github = {
    snapshot: async (sha) =>
      structuredClone(sha && sha !== snap.sha ? history.get(sha) : snap),
    call: async (path, method = "GET", value) => {
      if (method !== "GET") {
        writes++;
        if (path.endsWith("/git/trees")) return { sha: "new-tree" };
        if (path.endsWith("/git/commits")) return { sha: "commit-next" };
        if (path.includes("/git/refs/heads/")) {
          assert.equal(value.force, false);
          if (foreign) throw new Error("github_422");
          head = value.sha;
          if (lost) {
            lost = false;
            throw new Error("github_unavailable");
          }
          return {};
        }
      }
      if (path.endsWith("/git/ref/heads/main"))
        return { object: { sha: snap.sha } };
      if (path.includes("/pulls/"))
        return {
          number: 99,
          title: "test",
          html_url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/99",
          state: "open",
          merged: false,
          base: { ref: "main" },
          head: {
            repo: { full_name: "jigjpwiki/jigjpwiki.github.io" },
            ref: "admin/change-" + [...prs.keys()][0],
            sha: head,
          },
          mergeable: statusMode === "pending" ? null : true,
          mergeable_state: statusMode === "pending" ? "unknown" : "clean",
        };
      if (path.includes("/check-runs"))
        return {
          check_runs: [
            {
              name: "test",
              status: statusMode === "pending" ? "in_progress" : "completed",
              conclusion:
                statusMode === "failed"
                  ? "failure"
                  : statusMode === "pending"
                    ? null
                    : "success",
              html_url:
                "https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/1",
            },
          ],
        };
      if (path.includes("/status?")) return { statuses: [] };
      if (path.includes("/protection/")) return { contexts: ["test"] };
      if (path.includes("/rules/branches/")) return [];
      throw new Error("unexpected " + path);
    },
    publish: async (plan, id, journal, save) => {
      if (prs.has(id)) return { ...prs.get(id), recovered: true };
      journal.commit = head;
      await save(journal);
      if (failure) {
        failure = false;
        throw new Error("github_503");
      }
      writes++;
      const result = {
        number: 99,
        url: "https://github.com/jigjpwiki/jigjpwiki.github.io/pull/99",
      };
      prs.set(id, result);
      if (lost) {
        lost = false;
        throw new Error("github_unavailable");
      }
      return result;
    },
  };
  const workspace = new WorkspaceStore(store, secret),
    service = new Submissions(store, secret, github, "123");
  const save = async (ops) =>
    workspace.save("123", {
      protocol: 1,
      revision: (await workspace.get("123"))?.revision || 0,
      operations: ops,
    });
  return {
    service,
    workspace,
    store,
    map,
    secret,
    snap,
    history,
    github,
    original,
    save,
    writes: () => writes,
    fail: () => (failure = true),
    lost: () => (lost = true),
    advance: (modify = () => {}) => {
      history.set(snap.sha, structuredClone(snap));
      snap.sha = "new-main";
      modify(snap.models);
    },
    head: (v) => (head = v),
    status: (v) => (statusMode = v),
    foreign: () => (foreign = true),
  };
}
test("3-way distinguishes separate fields, equal changes, atomic arrays, deletes and conflicting values", () => {
  assert.deepEqual(threeWay({ a: 1, b: 2 }, { a: 3, b: 2 }, { a: 1, b: 4 }), {
    value: { a: 3, b: 4 },
    conflicts: [],
  });
  assert.equal(threeWay({ a: 1 }, { a: 2 }, { a: 2 }).conflicts.length, 0);
  assert.equal(threeWay({ a: 1 }, { a: 2 }, { a: 3 }).conflicts[0].field, "/a");
  assert.equal(
    threeWay({ a: [1] }, { a: [1, 2] }, { a: [1, 3] }).conflicts.length,
    1,
  );
  assert.equal(threeWay({ a: 1 }, {}, { a: 2 }).conflicts.length, 1);
});
test("20 mixed drafts become one PR; five selected leave 15; optional reason and deterministic retry", async () => {
  for (const count of [5, 20]) {
    const s = await setup(),
      ops = operations(s.original);
    await s.save(ops);
    const w = await s.workspace.get("123");
    const p = await s.service.preview({
      protocol: 2,
      revision: w.revision,
      keys: ops.slice(0, count).map((o) => o.key),
    });
    assert.match(p.title, /VTuber5件/);
    assert.match(p.summary, /Actor: 123/);
    assert.match(p.summary, /Batch:/);
    assert(!p.summary.includes("理由:"));
    const r = await s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: p.confirmationHash,
    });
    assert.equal(r.state, "submitted");
    assert.equal((await s.workspace.get("123")).operations.length, 20 - count);
    assert.equal(s.writes(), 1);
    assert.equal(
      (
        await s.service.submit({
          protocol: 2,
          previewId: p.id,
          confirmationHash: p.confirmationHash,
        })
      ).number,
      99,
    );
    assert.equal(s.writes(), 1);
    const stored = await s.service.get(p.id),
      a = stored.plan.files["audit:" + p.id];
    assert.equal(a.reason, null);
    audit(a, p.id);
    assert(!stored.plan.files["admin-ledger"]);
    assert.deepEqual(s.snap.models, s.original);
  }
});
test("failure and lost PR response recover journal and retain concurrent-tab changes", async () => {
  for (const lost of [false, true]) {
    const s = await setup(),
      ops = operations(s.original);
    await s.save(ops);
    const p = await s.service.preview({
      protocol: 2,
      revision: 1,
      keys: ops.slice(0, 5).map((o) => o.key),
    });
    lost ? s.lost() : s.fail();
    await assert.rejects(
      s.service.submit({
        protocol: 2,
        previewId: p.id,
        confirmationHash: p.confirmationHash,
      }),
    );
    assert.equal((await s.workspace.get("123")).operations.length, 20);
    const changed = structuredClone(ops);
    changed[0].value.displayName += " 別タブ";
    await s.save(changed);
    await s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: p.confirmationHash,
    });
    const remaining = (await s.workspace.get("123")).operations;
    assert.equal(remaining.length, 16);
    assert(remaining.some((o) => o.key === ops[0].key));
    assert.equal(s.writes(), 1);
  }
});
test("authentic baseline, operation keys, protocol, confirmation, ownership and revision fail closed", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  await assert.rejects(
    s.service.preview({ protocol: 1, revision: 1, keys: [ops[0].key] }),
  );
  await assert.rejects(
    s.service.preview({ protocol: 2, revision: 0, keys: [ops[0].key] }),
    /workspace_revision_conflict/,
  );
  await assert.rejects(
    s.service.preview({ protocol: 2, revision: 1, keys: ["unknown"] }),
    /unknown_operation/,
  );
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await assert.rejects(
    s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: "wrong",
    }),
    /field_confirmation_required/,
  );
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  await assert.rejects(
    new Submissions(s.store, s.secret, s.github, "456").get(p.id),
    /submission_owner/,
  );
  const invalid = structuredClone(ops);
  invalid[0].before.displayName = "偽のbaseline";
  await s.save(invalid);
  await assert.rejects(
    s.service.preview({ protocol: 2, revision: 3, keys: [ops[0].key] }),
    /baseline_mismatch/,
  );
});
test("latest main reapply preserves different records/fields, refuses conflict and changed main at submit", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  s.advance((m) => {
    m.talents.talents[0].wiki = { url: "https://wikiwiki.jp/jigjp/test" };
    m.talents.talents[1].displayName += " 他者";
  });
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  assert.equal(p.state, "ready");
  const stored = await s.store.get("submission-preview-v2:" + p.id);
  assert(stored.encrypted);
  assert.equal(p.records[0].value.wiki.url, "https://wikiwiki.jp/jigjp/test");
  s.snap.sha = "conflicting-main";
  s.snap.models.talents.talents[0].displayName += " 衝突";
  const c = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  assert.equal(c.state, "conflict");
  assert.equal(c.conflicts[0].field, "/displayName");
  assert.equal(c.currentRecords.length, 1);
  s.snap.sha = "third-main";
  await assert.rejects(
    s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: p.confirmationHash,
    }),
    /main_changed_reload/,
  );
  assert.equal(s.writes(), 0);
});
test("new IDs use latest reservations; missing dependencies, parent mismatch, private references and semantic contradictions reject", async () => {
  const s = await setup(),
    ops = [
      {
        key: "campaign",
        entity: "campaign",
        baseCommit: "main-sha",
        before: null,
        value: { title: "new", visibility: "draft" },
      },
    ];
  s.snap.models["catalog-id-registry"].issued.push("campaign-900000");
  const p = await planSubmission(s.snap, ops, {
    actor: "123",
    batchId: await hash("one"),
  });
  assert.equal(p.impact.records[0].id, "campaign-900001");
  const bad = {
    key: "offer",
    entity: "offer",
    baseCommit: "main-sha",
    before: null,
    value: { productId: "@absent" },
  };
  await assert.rejects(
    planSubmission(s.snap, [bad], { actor: "123", batchId: await hash("bad") }),
    /missing_dependency/,
  );
  const t = operations(s.original)[0];
  t.value.agencyStatus.value = "unaffiliated";
  t.value.affiliations.push({
    organizationId: s.original.talents.organizations[0].id,
    status: "current",
    from: null,
    to: null,
  });
  await assert.rejects(
    planSubmission(s.snap, [t], {
      actor: "123",
      batchId: await hash("contradiction"),
    }),
    /validation/,
  );
  const t2 = operations(s.original)[0];
  t2.value.visibility = "draft";
  await assert.rejects(
    planSubmission(s.snap, [t2], {
      actor: "123",
      batchId: await hash("private"),
    }),
    /validation/,
  );
});
test("different batches never touch shared audit; safe PR update retains original audit and refuses changed branch", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  s.advance((m) => (m.talents.talents[1].displayName += " 他者"));
  const u = await s.service.updatePreview(p.id);
  assert.equal(u.update, true);
  const result = await s.service.update(p.id, {
    protocol: 2,
    confirmationHash: u.confirmationHash,
  });
  assert.equal(result.number, 99);
  const r = await s.service.get(p.id);
  assert.equal(
    Object.keys(r.plan.files).filter((k) => k.startsWith("audit:")).length,
    2,
  );
  assert(!r.plan.files["admin-ledger"]);
  assert.equal(r.head, "commit-next");
  s.snap.sha = "third";
  s.head("foreign");
  await assert.rejects(s.service.updatePreview(p.id), /admin_branch_conflict/);
});
test("CI pending/failure and unknown required checks never claim mergeable; failed job links are returned", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  for (const mode of ["pending", "failed", "success"]) {
    await s.store.delete("submission-status-v2:" + p.id);
    s.status(mode);
    const detail = await s.service.status(p.id);
    assert.equal(detail.status.canMerge, mode === "success");
    if (mode === "failed") {
      assert.equal(detail.status.ci, "failed");
      assert.match(detail.status.checks[0].url, /actions/);
    }
  }
  s.github.call = new Proxy(s.github.call, {
    apply(fn, self, args) {
      if (args[0].includes("/protection/")) throw new Error("github_403");
      return Reflect.apply(fn, self, args);
    },
  });
  await s.store.delete("submission-status-v2:" + p.id);
  assert.equal((await s.service.status(p.id)).status.canMerge, false);
});

test("object key order does not create a false 3-way conflict", () => {
  assert.deepEqual(
    threeWay(
      { x: { a: 1, b: 2 } },
      { x: { a: 3, b: 4 } },
      { x: { b: 4, a: 3 } },
    ).conflicts,
    [],
  );
});

test("compound Campaign/Product/Offer dependencies are selected together, validated atomically and retain parent IDs", async () => {
  const { campaign } = await import("./content-fixtures.mjs");
  const s = await setup(),
    ops = campaign().map((o) => ({
      ...o,
      baseCommit: "main-sha",
      before: null,
    }));
  const p = await planSubmission(s.snap, ops, {
    actor: "123",
    batchId: await hash("compound"),
  });
  assert.equal(p.impact.records.length, 3);
  assert.equal(
    p.files.goods.products.length,
    s.original.goods.products.length + 1,
  );
  assert.equal(
    p.files.goods.offers.at(-1).productId,
    p.files.goods.products.at(-1).id,
  );
  const bad = structuredClone(ops);
  bad[2].value.productId = s.original.goods.products[0].id;
  await assert.rejects(
    planSubmission(s.snap, bad, {
      actor: "123",
      batchId: await hash("bad-parent"),
    }),
    /parent_relationship_mismatch/,
  );
  await assert.rejects(
    planSubmission(s.snap, ops.slice(0, 2), {
      actor: "123",
      batchId: await hash("partial-parent"),
    }),
    /parent_relationship_mismatch/,
  );
});
test("PR update confirmation/head/main locks and uncertain ref response never overwrite a foreign branch", async () => {
  for (const kind of ["head", "main", "lost"]) {
    const s = await setup(),
      ops = operations(s.original);
    await s.save(ops);
    const p = await s.service.preview({
      protocol: 2,
      revision: 1,
      keys: [ops[0].key],
    });
    await s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: p.confirmationHash,
    });
    s.advance((m) => (m.talents.talents[1].displayName += " other"));
    const u = await s.service.updatePreview(p.id);
    await assert.rejects(
      s.service.update(p.id, { protocol: 2, confirmationHash: "wrong" }),
      /field_confirmation_required/,
    );
    if (kind === "head") {
      s.head("foreign");
      await assert.rejects(
        s.service.update(p.id, {
          protocol: 2,
          confirmationHash: u.confirmationHash,
        }),
        /admin_branch_conflict/,
      );
    }
    if (kind === "main") {
      s.snap.sha = "newer";
      await assert.rejects(
        s.service.update(p.id, {
          protocol: 2,
          confirmationHash: u.confirmationHash,
        }),
        /admin_branch_conflict/,
      );
    }
    if (kind === "lost") {
      s.lost();
      await assert.rejects(
        s.service.update(p.id, {
          protocol: 2,
          confirmationHash: u.confirmationHash,
        }),
        /github_unavailable/,
      );
      const writes = s.writes();
      const restored = await s.service.update(p.id, {
        protocol: 2,
        confirmationHash: u.confirmationHash,
      });
      assert.equal(restored.recovered, true);
      assert.equal(s.writes(), writes);
    }
  }
});
test("PR update same-field conflicts require explicit choices and retain the unmodified audit record", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  const originalAudit = structuredClone(
    (await s.service.get(p.id)).plan.files["audit:" + p.id],
  );
  s.advance((m) => (m.talents.talents[0].displayName += " theirs"));
  const c = await s.service.updatePreview(p.id);
  assert.equal(c.state, "conflict");
  await assert.rejects(
    s.service.updatePreview(p.id, [
      { key: ops[0].key, field: "/displayName", choice: "arbitrary" },
    ]),
    /invalid_resolution/,
  );
  const u = await s.service.updatePreview(p.id, [
    { key: ops[0].key, field: "/displayName", choice: "ours" },
  ]);
  assert.equal(u.update, true);
  await s.service.update(p.id, {
    protocol: 2,
    confirmationHash: u.confirmationHash,
  });
  assert.deepEqual(
    (await s.service.get(p.id)).plan.files["audit:" + p.id],
    originalAudit,
  );
});
test("checks pagination/unknown conclusions are unknown, integration requirements and API cache are respected", async () => {
  const { ciState } = await import("../src/submissions.mjs");
  assert.equal(
    ciState(
      {
        total_count: 101,
        check_runs: [{ status: "completed", conclusion: "success" }],
      },
      { statuses: [] },
    ),
    "unknown",
  );
  assert.equal(
    ciState(
      { check_runs: [{ status: "completed", conclusion: null }] },
      { statuses: [] },
    ),
    "unknown",
  );
  assert.equal(ciState({ check_runs: [] }, { statuses: [] }), "unknown");
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  const call = s.github.call;
  let calls = 0;
  s.github.call = async (path, ...args) => {
    calls++;
    if (path.includes("/protection/"))
      return { contexts: ["test"], checks: [{ context: "test", app_id: 999 }] };
    return call(path, ...args);
  };
  assert.equal((await s.service.status(p.id)).status.canMerge, false);
  const count = calls;
  await s.service.status(p.id, true);
  assert.equal(calls, count);
});
test("separate record edits generate separate append-only files while preserving legacy ledger entries", async () => {
  const s = await setup(),
    ops = operations(s.original),
    a = await planSubmission(s.snap, [ops[0]], {
      actor: "123",
      batchId: await hash("A"),
    }),
    b = await planSubmission(s.snap, [ops[1]], {
      actor: "123",
      batchId: await hash("B"),
    });
  assert.notEqual(
    Object.keys(a.files).find((k) => k.startsWith("audit:")),
    Object.keys(b.files).find((k) => k.startsWith("audit:")),
  );
  assert(!a.files["admin-ledger"]);
  assert(!b.files["admin-ledger"]);
  assert.deepEqual(s.snap.models["admin-ledger"], s.original["admin-ledger"]);
  const copy = structuredClone(a.files["audit:" + (await hash("A"))]);
  copy.actor = "not-a-numeric-owner";
  const id = await hash("A");
  assert.throws(() => audit(copy, id), /invalid_admin_audit/);
});

test("PR text is regenerated for automatic summaries; manually edited text is retained", async () => {
  for (const manual of [false, true]) {
    const { prDescription } = await import("../src/github.mjs"),
      s = await setup(),
      ops = operations(s.original);
    await s.save(ops);
    const p = await s.service.preview({
      protocol: 2,
      revision: 1,
      keys: [ops[0].key],
    });
    await s.service.submit({
      protocol: 2,
      previewId: p.id,
      confirmationHash: p.confirmationHash,
    });
    const previous = await s.service.get(p.id);
    let title = "admin: " + previous.plan.title,
      body = manual ? "人間の補足" : prDescription(previous.plan),
      patches = 0;
    const call = s.github.call;
    s.github.call = async (path, method = "GET", value) => {
      if (path.includes("/pulls/") && method === "PATCH") {
        patches++;
        title = value.title;
        body = value.body;
        return { number: 99, title, body };
      }
      const result = await call(path, method, value);
      if (path.includes("/pulls/")) return { ...result, title, body };
      return result;
    };
    s.advance((m) => (m.talents.talents[1].displayName += " main"));
    const u = await s.service.updatePreview(p.id);
    assert.equal(u.preserveMetadata, manual);
    await s.service.update(p.id, {
      protocol: 2,
      confirmationHash: u.confirmationHash,
    });
    assert.equal(patches, manual ? 0 : 1);
    if (manual) assert.equal(body, "人間の補足");
    else assert.match(body, /Base: new-main/);
  }
});

test("unchanged preview cache is order-independent and does not reread all GitHub blobs", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  let reads = 0;
  const snapshot = s.github.snapshot;
  s.github.snapshot = async (...args) => {
    reads++;
    return snapshot(...args);
  };
  const a = await s.service.preview({
      protocol: 2,
      revision: 1,
      keys: ops.slice(0, 5).map((o) => o.key),
      reason: null,
    }),
    count = reads;
  const b = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: ops
      .slice(0, 5)
      .map((o) => o.key)
      .reverse(),
    reason: " ",
  });
  assert.equal(a.id, b.id);
  assert.equal(a.confirmationHash, b.confirmationHash);
  assert.equal(reads, count);
});

test("CI API permission failures preserve actual PR metadata but never claim success/mergeable", async () => {
  const s = await setup(),
    ops = operations(s.original);
  await s.save(ops);
  const p = await s.service.preview({
    protocol: 2,
    revision: 1,
    keys: [ops[0].key],
  });
  await s.service.submit({
    protocol: 2,
    previewId: p.id,
    confirmationHash: p.confirmationHash,
  });
  const call = s.github.call;
  s.github.call = async (path, ...args) => {
    if (path.includes("/check-runs")) throw new Error("github_403");
    return call(path, ...args);
  };
  const detail = await s.service.status(p.id);
  assert.equal(detail.status.state, "open");
  assert.equal(detail.status.ci, "unknown");
  assert.equal(detail.status.ciError, "github_403");
  assert.equal(detail.status.canMerge, false);
});
