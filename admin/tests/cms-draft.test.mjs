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

test("a karaoke draft restores multiple tracks and resolves their parent at publication", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { writeDraft, draftGroups } = await import("../src/cms-draft.mjs");
  const models = structuredClone(fixture);
  const original = models.karaoke.karaokes[0];
  const channel = models.media.videos.find((row) => row.youtubeId === original.youtubeId).channelId;
  const videoId = "fixture-123";
  models.youtube = [{ videoId, title: "歌枠試験", youtubeid: channel }];
  const editor = { ...member, directPublish: true, scope: { ...member.scope, categories: ["music"] } };
  const snap = { ...snapshot, models };
  const input = { sha: snapshot.sha, entity: "karaoke", talent: original.talentIds[0],
    videoUrl: "https://youtu.be/" + videoId, complete: true, setlist: [
      { key: "first", label: "曲一", startsAtSeconds: "10", endsAtSeconds: "20",
        newSongTitle: "新曲テスト", newSongArtist: "作者テスト", newSongUrl: "https://example.com/karaoke-original" },
      { key: "second", label: "曲二", startsAtSeconds: "30" },
    ] };
  const saved = writeDraft([], undefined, await prepareDraft(snap, editor, input));
  assert.deepEqual(draftInput({ operations: draftGroups(saved.operations).get(saved.id) }).setlist
    .map((track) => track.label), ["曲一", "曲二"]);
  const job = { id: "karaoke-test", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations: saved.operations };
  const { plan } = await publicationPlan(snap, job, editor);
  const parent = plan.files.karaoke.karaokes.at(-1);
  assert.equal(parent.setlistStatus, "complete");
  assert.equal(parent.expectedCount, 2);
  const restored = draftInput({ operations: draftGroups(saved.operations).get(saved.id) });
  assert.deepEqual(restored.setlist.map(({ key, startsAtSeconds }) => [key, startsAtSeconds]), [["first", "10"], ["second", "30"]]);
  assert.equal(restored.setlist[0].newSongTitle, "新曲テスト");
  assert.equal(restored.setlist[0].songId, "");
  const song = plan.files.music.songs.find((row) => row.title === "新曲テスト");
  const tracks = plan.files.karaoke.performances.filter((row) => row.karaokeId === parent.id);
  assert.deepEqual(tracks.map(({ order }) => order), [1, 2]);
  assert.equal(tracks[0].songId, song.id);
});

test("uncollected videos are verified against YouTube on save and publication", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { youtubeVideoLookup } = await import("../src/cms-music.mjs");
  const original = fixture.music.musicVideos[0];
  const { channelId } = fixture.media.videos.find((row) => row.youtubeId === original.youtubeId);
  const id = "external001";
  let privacyStatus = "public";
  let calls = 0;
  const lookup = youtubeVideoLookup("test-key", async (url, options) => {
    calls++;
    assert.equal(url.hostname, "www.googleapis.com");
    assert.equal(url.searchParams.get("id"), id);
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(options.headers["X-Goog-Api-Key"], "test-key");
    assert.equal(options.redirect, "manual");
    return Response.json({ items: [{ id, snippet: { title: "未収集動画", channelId }, status: { privacyStatus } }] });
  });
  const editor = { ...member, directPublish: true, scope: { ...member.scope, categories: ["music"] } };
  const input = { sha: snapshot.sha, entity: "musicVideo", talent: original.talentIds[0],
    rawSongTitle: "未収集の曲", videoKind: "cover", videoUrl: "https://youtu.be/" + id };
  const operations = await prepareDraft(snapshot, editor, input, lookup);
  const job = { id: "external-video", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations };
  const { plan } = await publicationPlan(snapshot, job, editor, lookup);
  assert.equal(plan.files.media.videos.at(-1).youtubeId, id);
  assert.equal(calls, 2);
  privacyStatus = "private";
  await assert.rejects(publicationPlan(snapshot, job, editor, lookup), /cms_video_not_public/);
  await assert.rejects(prepareDraft(snapshot, editor, input, lookup), /cms_video_not_public/);
});

test("standalone works require owner permission and retain their confirmed identity", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const editor = { ...member, directPublish: true, scope: { ...member.scope, categories: ["music"] } };
  const owner = { ...editor, owner: true };
  const input = { sha: snapshot.sha, entity: "song", title: "未使用楽曲の試験",
    artists: "試験作曲者", aliases: "別名", readings: "べつめい",
    songIdentityUrl: "https://example.com/standalone-song" };
  await assert.rejects(prepareDraft(snapshot, editor, input), /cms_scope_denied/);
  const operations = await prepareDraft(snapshot, owner, input);
  assert.equal(draftInput({ operations }).songIdentityUrl, input.songIdentityUrl);
  const job = { id: "standalone-song", owner: "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026", operations };
  await assert.rejects(publicationPlan(snapshot, job, editor), /cms_scope_denied/);
  const { plan } = await publicationPlan(snapshot, job, owner);
  assert.deepEqual(plan.files.music.songs.at(-1).aliases, [input.aliases]);
});

test("standalone video registration and title editing use the verified ID and scope", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const { draftDetails } = await import("../src/cms-draft.mjs");
  const models = structuredClone(fixture);
  const original = models.music.musicVideos[0];
  const { channelId } = models.media.videos.find((row) => row.youtubeId === original.youtubeId);
  const id = "standalone1";
  models.youtube = [{ videoId: id, title: "動画の公式タイトル", youtubeid: channelId }];
  const editor = { ...member, directPublish: true, scope: { ...member.scope, categories: ["music"] } };
  const snap = { ...snapshot, models };
  const owner = "8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
  const input = { sha: snapshot.sha, entity: "video", videoUrl: "https://youtu.be/" + id };
  const operations = await prepareDraft(snap, editor, input);
  assert.equal(draftInput({ operations }).videoUrl, "https://www.youtube.com/watch?v=" + id);
  const { plan } = await publicationPlan(snap, { id: "new-video", owner, operations }, editor);
  const editSnapshot = { ...snap, models: { ...models, ...plan.files } };
  const detail = draftDetails(editSnapshot, editor, "video", id);
  assert.equal(detail.title, "動画の公式タイトル");
  const edit = { ...input, id, title: "更新した動画のタイトル" };
  const edits = await prepareDraft(editSnapshot, editor, edit);
  const result = await publicationPlan(editSnapshot, { id: "edit-video", owner, operations: edits }, editor);
  assert.equal(result.plan.files.media.videos.find((row) => row.youtubeId === id).title, edit.title);
  await assert.rejects(prepareDraft(editSnapshot, editor, { ...edit, videoUrl: "https://youtu.be/changethis1" }), /cms_invalid_input/);
  editSnapshot.models.events.events[0].videoIds.push(id);
  await assert.rejects(prepareDraft(editSnapshot, editor, edit), /cms_scope_denied/);
});

 test("separately published new song can be selected by its issued ID in a new song video", async () => {
  const { publicationPlan } = await import("../src/cms-publish.mjs");
  const all = { role:"editor", contentPolicy:"all-content-v1", directPublish:true };
  const owner="8ebf4fde-85a4-4d34-9feb-d1ba5c4de026";
  const models=structuredClone(fixture);
  const video=models.music.musicVideos.shift();
  const first={sha:"a".repeat(40),models};
  const songOps=await prepareDraft(first,all,{entity:"song",sha:first.sha,title:"新曲リンク検証",artists:"試験アーティスト",aliases:"別名",readings:"しんきょく",songIdentityUrl:"https://example.com/standalone-link-test"});
  const {plan}=await publicationPlan(first,{id:"new-song-link-test",owner,createdAt:"2026-11-25T00:00:00Z",operations:songOps},all);
  const published=plan.files.music.songs.find(row=>row.title==="新曲リンク検証");assert.ok(published?.id);
  const next={sha:"b".repeat(40),models:{...models,...plan.files}};
  const ops=await prepareDraft(next,all,{entity:"musicVideo",sha:next.sha,talent:video.talentIds[0],rawSongTitle:"新曲リンク検証",videoUrl:"https://www.youtube.com/watch?v="+video.youtubeId,videoKind:video.type,songId:published.id});
  assert.equal(ops[0].value.songId,published.id);
  assert.equal(draftInput({operations:ops}).songId,published.id);
  const linked=await publicationPlan(next,{id:"new-video-link-test",owner,createdAt:"2026-11-25T00:00:00Z",operations:ops},all);
  assert.equal(linked.plan.files.music.musicVideos.find(row=>row.youtubeId===video.youtubeId).songId,published.id);
 });

test("new talent accepts copied Unicode YouTube handle profile links and normalizes SNS URLs",async()=>{
  const editor={role:"editor",contentPolicy:"all-content-v1",directPublish:true};
  const input={sha:snapshot.sha,entity:"talent",displayName:"新規登録回帰試験",image:"",activity:"ended",officialProfileUrl:"",
    youtubeUrl:"https://www.youtube.com/@%E6%96%B0%E8%A6%8F%E8%A9%A6%E9%A8%93/videos?si=example",
    xUrl:"https://x.com/cms_talent_regression/",tiktokUrl:"https://www.tiktok.com/@cms_talent_regression/",
    wikiUrl:"https://wikiwiki.jp/jigjp/%E8%A9%A6%E9%A8%93",agencyState:"affiliated",
    affiliations:[{organizationId:"org-000002",status:"current",from:null,to:null}],visibility:"public"};
  const ops=await prepareDraft(snapshot,editor,input);
  const value=ops[0].value;
  assert.equal(value.activityStatus.value,"ended");
  assert.equal(value.accounts.find(a=>a.service==="youtube").accountId,null);
  assert.equal(value.accounts.find(a=>a.service==="youtube").url,"https://www.youtube.com/@%E6%96%B0%E8%A6%8F%E8%A9%A6%E9%A8%93");
  assert.equal(value.accounts.find(a=>a.service==="tiktok").accountId,"cms_talent_regression");
  await assert.rejects(prepareDraft(snapshot,editor,{...input,youtubeUrl:"https://www.youtube.com/watch?v=abcdefghijk"}),/cms_invalid_account_url:youtube/);
  await assert.rejects(prepareDraft(snapshot,editor,{...input,youtubeUrl:"https://evil.example/@test"}),/cms_invalid_account_url:youtube/);
  await assert.rejects(prepareDraft(snapshot,editor,{...input,agencyState:"unknown"}),/cms_affiliation_state_mismatch/);
  await assert.rejects(prepareDraft(snapshot,editor,{...input,affiliations:[{organizationId:"org-000002",status:"current",from:null,to:"2026-11-01"}]}),/cms_affiliation_current_end/);
});
