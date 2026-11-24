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
