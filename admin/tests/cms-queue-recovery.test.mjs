import test from "node:test";
import assert from "node:assert/strict";
import { CmsJobs } from "../src/cms-jobs.mjs";
import { b64 } from "../src/security.mjs";

function harness() {
  const rows = new Map();
  const faults = { rejectIndex: false };
  const admin = {
    env: { SESSION_KEY: b64(new Uint8Array(32)) },
    store: {
      get: async (key) => rows.get(key),
      put: async (key, value) => {
        if (faults.rejectIndex && key === "cms-publication:editor") throw Error("interrupted index write");
        rows.set(key, value);
      },
    },
    atomic: (callback) => callback(),
    state: { storage: { setAlarm: async () => {} } },
  };
  return { admin, faults };
}

test("a restart repairs a terminal owner index from the authoritative journal", async () => {
  const { admin, faults } = harness();
  const job = { id: "one", owner: "editor", createdAt: "2026-11-24T00:00:00Z" };
  await new CmsJobs(admin).report({ ...job, phase: "checking" });
  faults.rejectIndex = true;
  await assert.rejects(new CmsJobs(admin).report({ ...job, phase: "unconfirmed" }), /interrupted/);
  faults.rejectIndex = false;
  const restarted = new CmsJobs(admin);
  assert.equal((await restarted.status(job.owner)).phase, "unconfirmed");
  await restarted.alarm();
  assert.equal((await restarted.get("cms-publication:editor")).phase, "unconfirmed");
});

test("draft cleanup keeps related operations together when one was edited in flight", async () => {
  const { admin } = harness();
  const jobs = new CmsJobs(admin);
  const operation = (key, entity, value) => ({ key, entity, baseCommit: "main", before: null, value });
  const product = operation("cms-product", "product", { title: "品物" });
  const offer = operation("cms-sale", "offer", { productId: "@cms-product", url: "https://example.com/a" });
  const event = operation("cms-event", "event", { title: "イベント" });
  const saved = await jobs.workspace.save("editor", { protocol: 1, revision: 0, operations: [product, offer, event] });
  await jobs.workspace.save("editor", { protocol: 1, revision: 1, operations: [
    product, { ...offer, value: { ...offer.value, url: "https://example.com/b" } }, event,
  ] });
  await jobs.clearAppliedDrafts({ owner: "editor", operations: saved.operations });
  const restored = await jobs.workspace.get("editor");
  assert.deepEqual(restored.operations.map(({ key }) => key), ["cms-product", "cms-sale"]);
  assert.equal(restored.operations[1].value.url, "https://example.com/b");
});
