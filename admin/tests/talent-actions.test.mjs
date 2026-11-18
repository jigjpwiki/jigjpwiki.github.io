import { personSections } from "../public/record-browser.js";
import { hash } from "../src/security.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "./content-fixtures.mjs";
import {
  planIntent,
  projectedModels,
  localIssues,
  referencesTo,
} from "../public/talent-actions.js";
import { planSubmission } from "../src/submission-plan.mjs";
import {
  publicTalents,
  publicFeed,
  assertPrivateUnreferenced,
} from "../../lib/talent-publication.js";
const opts = (s) => ({ snapshot: s, operations: [], reason: "test" });
test("ten retirements are atomic and preserve publication, affiliations, references, originals and Undo input", () => {
  const s = snapshot(),
    raw = structuredClone(s.models),
    ids = s.models.talents.talents.slice(0, 10).map((t) => t.id),
    p = planIntent(s.models, [], ids, "retire", {}, s.sha),
    m = projectedModels(s.models, p.operations);
  assert.equal(p.changes.length, 10);
  for (const id of ids) {
    const a = raw.talents.talents.find((t) => t.id === id),
      b = m.talents.talents.find((t) => t.id === id);
    assert.equal(b.activityStatus.value, "retired");
    assert.deepEqual(b.affiliations, a.affiliations);
    assert.equal(b.visibility, a.visibility);
  }
  assert.deepEqual(s.models, raw);
  assert.throws(() =>
    planIntent(s.models, [], [ids[0], "bad"], "end", {}, s.sha),
  );
});
test("leave/transfer preserve history and activity; unknown dates stay null; invalid dates/targets reject whole plan", () => {
  const s = snapshot(),
    t = s.models.talents.talents.find((t) =>
      t.affiliations.some((a) => a.status === "current"),
    ),
    org = t.affiliations.find((a) => a.status === "current").organizationId,
    target = s.models.talents.organizations.find((o) => o.id !== org).id;
  const p = planIntent(
      s.models,
      [],
      [t.id],
      "transfer",
      { organizationId: org, toOrganizationId: target },
      s.sha,
    ),
    m = projectedModels(s.models, p.operations),
    v = m.talents.talents.find((x) => x.id === t.id);
  assert.equal(
    v.affiliations.find((a) => a.organizationId === org).status,
    "former",
  );
  assert(
    v.affiliations.some(
      (a) => a.organizationId === target && a.from === null && a.to === null,
    ),
  );
  assert.deepEqual(v.activityStatus, t.activityStatus);
  assert.equal(v.visibility, t.visibility);
  assert.throws(() =>
    planIntent(
      s.models,
      [],
      [t.id],
      "leave",
      { organizationId: org, date: "2000-02-30" },
      s.sha,
    ),
  );
  assert.throws(() =>
    planIntent(s.models, [], [t.id], "join", { organizationId: "bad" }, s.sha),
  );
});
test("history name approval publishes exactly ID/name/marker and keeps related records; strict draft still rejects public references", async () => {
  const s = snapshot(),
    t = s.models.talents.talents[0],
    p = planIntent(s.models, [], [t.id], "hideHistory", {}, s.sha),
    m = projectedModels(s.models, p.operations);
  assert(referencesTo(s.models, t.id).length);
  assert.equal(p.changes.length, 1);
  const name = publicTalents(m.talents).talents.find((x) => x.id === t.id);
  assert.deepEqual(name, {
    id: t.id,
    displayName: t.displayName,
    profileHidden: true,
  });
  assert.doesNotThrow(() =>
    assertPrivateUnreferenced(m.talents, [m.anniversaries, m.catalog]),
  );
  delete m.talents.talents[0].historyNamePublic;
  assert.throws(() =>
    assertPrivateUnreferenced(m.talents, [m.anniversaries, m.catalog]),
  );
  const plan = await planSubmission(s, p.operations, {
    actor: "123",
    batchId: await hash("history"),
  });
  assert(plan.files.talents);
});
test("private closure retains all IDs/content and validates complete hidden setlists/groups; unsafe partial selection rejected", async () => {
  const s = snapshot(),
    id = s.models.talents.talents[0].id,
    p = planIntent(s.models, [], [id], "hidePrivate", {}, s.sha),
    m = projectedModels(s.models, p.operations);
  assert.equal(localIssues(m).length, 0);
  for (const [type, file] of [
    ["talents", "talents"],
    ["events", "events"],
    ["products", "goods"],
  ])
    assert.deepEqual(
      m[file][type].map((x) => x.id),
      s.models[file][type].map((x) => x.id),
    );
  const plan = await planSubmission(s, p.operations, {
    actor: "123",
    batchId: await hash("private"),
  });
  assert(plan.files.talents);
  await assert.rejects(
    planSubmission(
      s,
      p.operations.filter((o) => o.entity === "talent"),
      { actor: "123", batchId: await hash("partial") },
    ),
  );
});
test("feed privacy filtering handles verified IDs, aliases, names and malformed account-less rows without rewriting sources", () => {
  const s = snapshot(),
    t = s.models.talents.talents[0];
  t.visibility = "draft";
  delete t.historyNamePublic;
  const id = t.accounts.find((a) => a.service === "youtube").accountId,
    rows = [
      { youtubeid: id, title: "archive" },
      { title: t.displayName },
      { title: "unrelated" },
      { name: "not inferred" },
    ],
    raw = structuredClone(rows);
  assert.deepEqual(publicFeed(rows, s.models.talents), rows.slice(2));
  assert.deepEqual(rows, raw);
  t.historyNamePublic = true;
  assert.deepEqual(publicFeed(rows, s.models.talents), rows.slice(1));
  const different = { youtubeid: id.toLowerCase(), title: "other channel" };
  if (id !== id.toLowerCase())
    assert.deepEqual(publicFeed([different], s.models.talents), [different]);
});
test("group join/leave are independent of personal activity/publication and preserve past participation", () => {
  const s = snapshot(),
    t = s.models.talents.talents[0],
    g = s.models.catalog.groups[0];
  const p = planIntent(
      s.models,
      [],
      [t.id],
      "groupLeave",
      { groupId: g.id },
      s.sha,
    ),
    m = projectedModels(s.models, p.operations);
  assert.deepEqual(m.talents, s.models.talents);
  assert.deepEqual(m.events, s.models.events);
  assert(!m.catalog.groups[0].talentIds.includes(t.id));
});

test("unlinked private names in public text require review, and multi-affiliation transfers need an explicit origin", () => {
  const s = snapshot(),
    t = s.models.talents.talents[0];
  s.models.goods.campaigns[0].title = t.displayName + " の未リンク企画";
  assert.throws(
    () => planIntent(s.models, [], [t.id], "hidePrivate", {}, s.sha),
    /未リンク企画/,
  );
  assert.throws(
    () => planIntent(snapshot().models, [], [t.id], "leave", {}, s.sha),
    /退所元/,
  );
});
test("private media and quoted aliases cannot escape server checks or feed filtering", () => {
  const s = snapshot(),
    t = s.models.talents.talents[0];
  t.visibility = "draft";
  t.aliases.push({ name: '名前"引用', type: "alias", from: null, to: null });
  assert.equal(
    publicFeed([{ title: '名前"引用のアーカイブ' }], s.models.talents).length,
    0,
  );
  assert.throws(() =>
    assertPrivateUnreferenced(s.models.talents, [
      {
        videos: [
          {
            visibility: "public",
            title: "private disclosure",
            channelId: t.accounts.find((a) => a.accountId).accountId,
          },
        ],
      },
    ]),
  );
});

test("normal grouping is deterministic without duplicates; former, unknown and unaffiliated stay distinct", () => {
  const orgs = [
      { id: "org-b", name: "B" },
      { id: "org-a", name: "A" },
    ],
    rows = [
      {
        id: "one",
        affiliations: [
          { organizationId: "org-a", status: "current" },
          { organizationId: "org-b", status: "current" },
        ],
      },
      {
        id: "two",
        affiliations: [{ organizationId: "org-a", status: "former" }],
        agencyStatus: { value: "unknown" },
      },
      {
        id: "three",
        affiliations: [],
        agencyStatus: { value: "unaffiliated" },
      },
      { id: "four", affiliations: [], agencyStatus: { value: "unknown" } },
    ];
  const groups = personSections(rows, orgs);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["org-b", "former", "unaffiliated", "unknown"],
  );
  assert.equal(
    new Set(groups.flatMap((g) => g.rows.map((r) => r.id))).size,
    rows.length,
  );
});

test("privacy closes a related campaign and preserves a pending video identity", async () => {
  const s = snapshot(),
    id = s.models.karaoke.karaokes[0].talentIds[0],
    t = s.models.talents.talents.find((t) => t.id === id),
    video = {
      ...structuredClone(s.models.media.videos[0]),
      youtubeId: "NEWVIDEO001",
      channelId: t.accounts.find((a) => a.service === "youtube").accountId,
    },
    op = {
      key: "new-video",
      entity: "video",
      baseCommit: s.sha,
      before: null,
      value: video,
    };
  const p = planIntent(s.models, [op], [id], "hidePrivate", {}, s.sha);
  assert(p.changes.length > 100);
  assert.equal(
    p.operations.find((o) => o.key === op.key).value.youtubeId,
    video.youtubeId,
  );
  assert.equal(
    p.operations.find((o) => o.key === op.key).value.visibility,
    "draft",
  );
  assert.equal(op.value.visibility, "public");
  const m = projectedModels(s.models, p.operations);
  assert(
    m.goods.campaigns.some(
      (c) => c.title.includes(t.displayName) && c.visibility === "draft",
    ),
  );
  const plan = await planSubmission(s, p.operations, {
    actor: "123",
    batchId: await hash("complex-privacy"),
  });
  assert(plan.files.karaoke);
});

test("an unrelated invalid draft is preserved for partial submission, never silently fixed or published", async () => {
  const s = snapshot(),
    bad = structuredClone(
      s.models.talents.talents.find(
        (t) =>
          t.affiliations.some((a) => a.status === "current") &&
          t.id !== s.models.talents.talents[0].id,
      ),
    ),
    value = structuredClone(bad);
  value.agencyStatus.value = "unknown";
  const pending = {
      key: "invalid-kept",
      entity: "talent",
      id: bad.id,
      before: bad,
      baseCommit: s.sha,
      value,
    },
    id = s.models.talents.talents[0].id,
    p = planIntent(s.models, [pending], [id], "pause", {}, s.sha);
  assert.deepEqual(
    p.operations.find((o) => o.key === pending.key),
    pending,
  );
  await assert.rejects(
    planSubmission(s, p.operations, {
      actor: "123",
      batchId: await hash("all-invalid"),
    }),
  );
  const approved = p.operations.filter((o) => o.id === id);
  assert(
    (
      await planSubmission(s, approved, {
        actor: "123",
        batchId: await hash("partial-valid"),
      })
    ).files.talents,
  );
});
