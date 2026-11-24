import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../tests/fixtures/admin-vnext-baseline.json" with { type: "json" };
import { prepareDraft, draftInput } from "../src/cms-draft.mjs";

const member = { role: "editor", scope: { organizations: ["org-000003"], categories: ["events", "goods"] } };
const snapshot = { sha: "test-main", models: fixture };
const event = {
  sha: snapshot.sha, entity: "event", organization: "org-000003", title: "イベント試験",
  venue: "", summary: "説明", announcementUrl: "https://example.com/event",
};

test("event drafts use the existing validation and reject stale or foreign writes", async () => {
  const operations = await prepareDraft(snapshot, member, event);
  assert.equal(draftInput({ operations }).title, event.title);
  assert.equal(operations[0].value.visibility, "public");
  await assert.rejects(prepareDraft(snapshot, member, { ...event, sha: "stale" }), /main_changed_reload/);
  await assert.rejects(prepareDraft(snapshot, member, { ...event, organization: "org-000001" }), /cms_scope_denied/);
  await assert.rejects(prepareDraft(snapshot, { ...member, role: "viewer" }, event), /cms_scope_denied/);
});

test("standalone goods and sale information are prepared as one validated set", async () => {
  const operations = await prepareDraft(snapshot, member, {
    sha: snapshot.sha, entity: "product", talent: "tal-000010", title: "商品試験",
    image: "", identityUrl: "https://example.com/product", url: "https://example.com/sale", price: "1200",
  });
  assert.deepEqual(operations.map((op) => op.entity), ["product", "offer"]);
  assert.equal(draftInput({ operations }).price, "1200");
  assert.equal(operations[1].value.productId, "@cms-product");
});

test("saving separate drafts retains both batches and discarding one retains the other", async () => {
  const { draftGroups, writeDraft } = await import("../src/cms-draft.mjs");
  const first = writeDraft([], undefined, await prepareDraft(snapshot, member, event));
  const second = writeDraft(first.operations, undefined, await prepareDraft(snapshot, member, {
    ...event, title: "別のイベント試験",
  }));
  const groups = draftGroups(second.operations);
  assert.equal(groups.size, 2);
  assert.equal(groups.get(first.id)[0].value.title, event.title);
  const kept = writeDraft(second.operations, first.id);
  assert.deepEqual([...draftGroups(kept.operations).keys()], [second.id]);
  const changed = first.operations.map((op) => ({ ...op, key: "cms-event", before: { title: "別の編集者による変更" } }));
  assert.throws(() => writeDraft(first.operations, first.id, changed), /main_changed_reload/);
});

test("editing the amount of a standalone listing preserves its existing currency", async () => {
  const models = structuredClone(fixture);
  const { products, offers } = models.goods;
  const product = products[0];
  const offer = offers.find((row) => row.productId === product.id);
  offer.campaignId = null;
  offer.price = { amount: 10, currency: "USD" };
  const operations = await prepareDraft({ ...snapshot, models }, member, {
    sha: snapshot.sha, entity: "product", id: product.id, title: product.title,
    image: product.image || "", identityUrl: product.identityUrl,
    url: offer.url, price: "12.50",
  });
  assert.deepEqual(operations[1].value.price, { amount: 12.5, currency: "USD" });
});

test("anniversary drafts restore date fields and reject people outside the assigned scope", async () => {
  const editor = { ...member, scope: { ...member.scope, categories: ["anniversaries"] } };
  const input = { sha: snapshot.sha, entity: "anniversary", talent: "tal-000010",
    title: "試験記念日", kind: "other", month: "5", day: "12", year: "" };
  const operations = await prepareDraft(snapshot, editor, input);
  assert.equal(draftInput({ operations }).month, "5");
  await assert.rejects(prepareDraft(snapshot, editor, { ...input, talent: "tal-000001" }), /cms_scope_denied/);
});

test("event performer changes reject out of scope references", async () => {
  const operations = await prepareDraft(snapshot, member, { ...event, performers: ["tal-000010"] });
  assert.deepEqual(operations[0].value.talentIds, ["tal-000010"]);
  await assert.rejects(prepareDraft(snapshot, member, { ...event, performers: ["tal-000001"] }), /cms_scope_denied/);
});

test("campaign and sale references survive saving and restore", async () => {
  const { writeDraft, draftGroups } = await import("../src/cms-draft.mjs");
  const input = { sha: snapshot.sha, entity: "product", talent: "tal-000010",
    title: "キャンペーン商品試験", image: "", identityUrl: "https://example.com/product",
    url: "https://example.com/sale", price: "1200", campaignTitle: "キャンペーン試験" };
  const saved = writeDraft([], undefined, await prepareDraft(snapshot, member, input));
  const group = draftGroups(saved.operations).get(saved.id);
  assert.equal(group[1].value.productId, "@" + group[0].key);
  assert.equal(group[1].value.campaignId, "@" + group[2].key);
  assert.equal(draftInput({ operations: group }).campaignTitle, input.campaignTitle);
  await prepareDraft(snapshot, member, { ...input, campaignTitle: "", campaignId: "campaign-000001" });
});

test("campaign publication checks the original campaign before adding a product", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { writeDraft } = await import("../src/cms-draft.mjs");
  const editor = { ...member, directPublish: true };
  const input = { sha: snapshot.sha, entity: "product", talent: "tal-000010",
    title: "公開計画試験", image: "", identityUrl: "https://example.com/product",
    url: "https://example.com/sale", price: "1200", startsAt: "2027-01-01T10:00" };
  for (const target of [{ campaignTitle: "新規試験" }, { campaignId: "campaign-000001" }]) {
    const operations = writeDraft([], undefined, await prepareDraft(snapshot, editor, { ...input, ...target })).operations;
    const job = { id: "test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations };
    const { plan } = await publicationPlan(snapshot, job, editor);
    assert.equal(plan.files.goods.offers.at(-1).startsAt, "2027-01-01T01:00:00.000Z");
    if (target.campaignId) {
      const models = structuredClone(snapshot.models);
      models.goods.offers = models.goods.offers.filter((offer) => offer.campaignId !== target.campaignId);
      await assert.rejects(prepareDraft({ ...snapshot, models }, editor, { ...input, ...target }), /cms_scope_denied/);
      await assert.rejects(publicationPlan({ ...snapshot, models }, job, editor), /cms_scope_denied/);
    }
  }
});

test("draft batches can reorder and drop child operations without replacing their root", async () => {
  const { writeDraft, draftGroups } = await import("../src/cms-draft.mjs");
  const input = { sha: snapshot.sha, entity: "product", talent: "tal-000010",
    title: "商品試験", image: "", identityUrl: "https://example.com/product",
    url: "https://example.com/sale", price: "1200", campaignTitle: "試験企画" };
  const operations = await prepareDraft(snapshot, member, input);
  const saved = writeDraft([], undefined, operations);
  const reordered = writeDraft(saved.operations, saved.id, [...operations].reverse());
  assert.equal(draftGroups(reordered.operations).get(saved.id)[0].entity, "product");
  const standalone = await prepareDraft(snapshot, member, { ...input, url: "", campaignTitle: "" });
  assert.equal(writeDraft(reordered.operations, saved.id, standalone).operations.length, 1);
});

test("an existing campaign title is editable only inside the assigned scope", async () => {
  const input = { sha: snapshot.sha, entity: "campaign", id: "campaign-000001", title: "新しい企画名" };
  const edits = await prepareDraft(snapshot, member, input);
  assert.equal(draftInput({ operations: edits }).title, input.title);
  await assert.rejects(prepareDraft(snapshot, { ...member, scope: {
    organizations: ["org-000001"], categories: ["goods"],
  } }, input), /cms_scope_denied/);
});

test("a new talent uses the existing ID registry plan and requires an assigned organization", async () => {
  const input = { entity: "talent", sha: snapshot.sha, organization: "org-000003",
    displayName: "新人登録試験", image: "", activity: "unknown",
    officialProfileUrl: "https://example.com/new-talent" };
  const editor = { ...member, scope: { ...member.scope, categories: ["talents"] } };
  const operations = await prepareDraft(snapshot, editor, input);
  assert.equal(draftInput({ operations }).displayName, input.displayName);
  await assert.rejects(prepareDraft(snapshot, editor, { ...input, organization: "org-000001" }), /cms_scope_denied/);
});

test("a song video can reuse scoped media but rejects a mismatched registered channel", async () => {
  const models = structuredClone(fixture);
  const original = models.music.musicVideos.shift();
  const editor = { ...member, scope: { ...member.scope, categories: ["music"] } };
  const input = { sha: snapshot.sha, entity: "musicVideo", talent: original.talentIds[0],
    rawSongTitle: original.rawSongTitle, songId: original.songId, videoKind: original.type,
    videoUrl: "https://youtu.be/" + original.youtubeId };
  const operations = await prepareDraft({ ...snapshot, models }, editor, input);
  assert.equal(draftInput({ operations }).songId, original.songId);
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const job = { id: "video-test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations };
  const publisher = { ...editor, directPublish: true };
  const { plan } = await publicationPlan({ ...snapshot, models }, job, publisher);
  assert.equal(plan.files.music.musicVideos.at(-1).youtubeId, original.youtubeId);
  const media = models.media.videos.find(({ youtubeId }) => youtubeId === original.youtubeId);
  media.channelId = models.talents.talents[0].accounts.find(({ service }) => service === "youtube").accountId;
  await assert.rejects(prepareDraft({ ...snapshot, models }, editor, input), /cms_scope_denied/);
  await assert.rejects(publicationPlan({ ...snapshot, models }, job, publisher), /cms_scope_denied/);
});

test("collected media, new work and song video remain one scoped publication batch", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { writeDraft, draftGroups } = await import("../src/cms-draft.mjs");
  const models = structuredClone(fixture);
  const original = models.music.musicVideos[0];
  const channel = models.media.videos.find((row) => row.youtubeId === original.youtubeId).channelId;
  const videoId = "fixture-123";
  models.youtube = [{ videoId, title: "収録済み動画", youtubeid: channel }];
  const editor = { ...member, directPublish: true, scope: { ...member.scope, categories: ["music"] } };
  const input = { sha: snapshot.sha, entity: "musicVideo", talent: original.talentIds[0],
    rawSongTitle: "動画の曲名", videoKind: "cover", videoUrl: "https://youtu.be/" + videoId,
    newSongTitle: "試験用新曲", newSongArtist: "試験用作曲者", newSongUrl: "https://example.com/original",
  };
  const snap = { ...snapshot, models };
  const stored = writeDraft([], undefined, await prepareDraft(snap, editor, input));
  assert.equal(draftInput({ operations: draftGroups(stored.operations).get(stored.id) }).newSongTitle, input.newSongTitle);
  const job = { id: "bundle-test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations: stored.operations };
  const { plan } = await publicationPlan(snap, job, editor);
  assert.equal(plan.files.music.musicVideos.at(-1).songId, plan.files.music.songs.at(-1).id);
  assert.equal(plan.files.media.videos.at(-1).channelId, channel);
});

test("an editor cannot obtain a channel association by creating a talent", async () => {
  const editor = { ...member, scope: { ...member.scope, categories: ["talents"] } };
  const input = {
    sha: snapshot.sha, entity: "talent", organization: "org-000003",
    displayName: "新規登録試験", image: "", activity: "unknown",
    officialProfileUrl: "https://example.com/profile",
    youtubeUrl: "https://www.youtube.com/channel/UC1234567890123456789012",
  };
  await assert.rejects(prepareDraft(snapshot, editor, input), /cms_identity_anchor/);
});
