import test from "node:test";
import assert from "node:assert/strict";
import { cmsPermissions, normalizeScope } from "../src/cms-scope.mjs";
import baseline from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };

const member = {
  role: "editor",
  scope: { organizations: ["org-000001"], categories: ["events", "talents"] },
};
const event = {
  visibility: "public",
  organizerIds: ["org-000001"],
  relatedOrganizationIds: [],
  talentIds: [],
  slots: [],
};

test("CMS constraints cover both sides of an edit and nested related references", () => {
  const access = cmsPermissions(baseline, member);
  const outside = { ...event, relatedOrganizationIds: ["org-000002"] };
  assert.equal(access.canRead("event", event), true);
  assert.equal(access.canRead("event", outside), false);
  assert.equal(access.canRead("event", { ...event, slots: [{ talentIds: ["tal-999999"] }] }), false);
  assert.equal(access.canRead("event", { ...event, visibility: "draft" }), false);
  assert.throws(() => access.assertChange("event", outside, event), /cms_scope_denied/);
  assert.throws(() => access.assertChange("event", event, outside), /cms_scope_denied/);
  assert.throws(() => access.assertChange("event", event, event, { publish: true }), /cms_scope_denied/);
  assert.doesNotThrow(() => access.assertChange("event", event, { ...event, title: "更新" }));
});

test("viewers cannot edit, and editors cannot claim new talent affiliations", () => {
  const viewer = cmsPermissions(baseline, { ...member, role: "viewer", directPublish: true });
  assert.equal(viewer.canRead("event", event), true);
  assert.throws(() => viewer.assertChange("event", event, event), /cms_scope_denied/);
  const talent = baseline.talents.talents[0];
  const editor = cmsPermissions(baseline, member);
  assert.throws(() => editor.assertChange("talent", null, { ...talent, affiliations: [...talent.affiliations, { organizationId: "org-000002", status: "current" }] }), /cms_scope_denied/);
  assert.throws(() => normalizeScope({ organizations: ["*"] }), /invalid_member_scope/);
  assert.equal(cmsPermissions(baseline, { role: "editor" }).canRead("event", event), false);
});

test("explicit all-content grant covers future organizations without granting system ownership", async () => {
  const { allContentPolicy, normalizeMemberPolicy } = await import("../src/cms-scope.mjs");
  const editor = { role: "editor", contentPolicy: allContentPolicy, directPublish: true };
  const access = cmsPermissions(baseline, editor);
  const future = { ...event, relatedOrganizationIds: ["org-999999"] };
  assert.equal(access.canRead("event", future), true);
  assert.doesNotThrow(() => access.assertChange("event", event, future, { publish: true }));
  assert.equal(editor.owner, undefined);
  const viewer = cmsPermissions(baseline, { ...editor, role: "viewer" });
  assert.equal(viewer.canRead("event", future), true);
  assert.throws(() => viewer.assertChange("event", event, future), /cms_scope_denied/);
  assert.equal(normalizeMemberPolicy({}, undefined), allContentPolicy);
  assert.equal(normalizeMemberPolicy({}, member), "scoped-v1");
  assert.throws(() => normalizeMemberPolicy({ contentPolicy: allContentPolicy }, member),
    /content_policy_confirmation_required/);
  assert.equal(normalizeMemberPolicy({ contentPolicy: allContentPolicy, confirmPolicyMigration: true }, member), allContentPolicy);
  assert.deepEqual(member.scope.organizations, ["org-000001"]);
});

test("real catalog exposes all thirteen collections with stable display labels and preserves scoped access", async () => {
  const { scopedCatalog, allContentPolicy } = await import("../src/cms-scope.mjs");
  const sections = scopedCatalog(baseline, { role: "editor", contentPolicy: allContentPolicy });
  assert.equal(sections.length, 13);
  for (const entity of ["organization", "group", "offer", "performance"]) {
    const section = sections.find((row) => row.entity === entity);
    assert.ok(section?.items.length, entity);
    assert.ok(section.items.every((row) => typeof row.title === "string" && row.title.length > 0));
  }
  assert.equal(sections.find((row) => row.entity === "organization").items[0].title, baseline.talents.organizations[0].name);
  assert.equal(sections.find((row) => row.entity === "performance").items[0].title, baseline.karaoke.performances[0].rawLabel);
  const scoped = scopedCatalog(baseline, member);
  assert.ok(!scoped.some((row) => ["organization", "offer", "performance"].includes(row.entity)));
});

test("CMS talent collection follows shared seniority order without changing read permissions", async () => {
  const {scopedCatalog,allContentPolicy}=await import("../src/cms-scope.mjs");
  const model=structuredClone(baseline);
  const first=model.talents.talents[0],second=model.talents.talents[1];
  first.affiliations[0].from="2026-01-01";second.affiliations[0].from="2024-01-01";
  model.anniversaries.events=[];
  const before=structuredClone(model);
  const ids=scopedCatalog(model,{role:"editor",contentPolicy:allContentPolicy}).find(s=>s.entity==="talent").items.map(t=>t.id);
  assert(ids.indexOf(second.id)<ids.indexOf(first.id));
  const scoped=scopedCatalog(model,member).find(s=>s.entity==="talent").items;
  assert(scoped.every(t=>cmsPermissions(model,member).canRead("talent",model.talents.talents.find(p=>p.id===t.id))));
  assert.deepEqual(model,before);
});
