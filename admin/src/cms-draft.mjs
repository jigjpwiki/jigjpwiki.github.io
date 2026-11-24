import { collectedVideo, assertSongEdit, newSongOperation, newSongFields } from "./cms-music.mjs";
import { youtubeId } from "../public/content-utils.js";
import { planSubmission } from "./submission-plan.mjs";
import { contentPreview, resolveRefs } from "./content-plan.mjs";
import { cmsPermissions, assertExistingCampaign } from "./cms-scope.mjs";
import { fail, hash } from "./security.mjs";

export const draftTypes = { karaoke: ["karaoke", "karaokes"], song: ["music", "songs"], musicVideo: ["music", "musicVideos"], talent: ["talents", "talents"], event: ["events", "events"], product: ["goods", "products"], anniversary: ["anniversaries", "events"], campaign: ["goods", "campaigns"] };
const unknown = { precision: "unknown", value: null };
const fields = {
  karaoke: [],
  song: ["title"],
  musicVideo: ["rawSongTitle"],
  talent: ["displayName"],
  anniversary: ["title"],
  campaign: ["title"],
  event: ["title", "venue", "announcementUrl", "summary"],
  product: ["title", "image", "identityUrl"],
};

export async function prepareDraft(snapshot, member, input) {
  const { entity, id } = input;
  if (!Object.hasOwn(draftTypes, entity) || member.role !== "editor") fail(403, "cms_scope_denied");
  if (input.sha !== snapshot.sha) fail(409, "main_changed_reload");
  const [file, list] = draftTypes[entity];
  const before = id ? snapshot.models[file][list].find((row) => row.id === id) : null;
  const access = cmsPermissions(snapshot.models, member);
  if (id && !access.canRead(entity, before)) fail(403, "cms_scope_denied");
  if (entity === "talent") {
    const value = structuredClone(before || {
      aliases: [], affiliations: [{ organizationId: input.organization, status: "current", from: null, to: null }],
      agencyStatus: { value: "affiliated" }, accounts: [], wiki: null,
      officialProfileUrl: input.officialProfileUrl || null, visibility: "public",
    });
    if (typeof input.displayName !== "string" || typeof input.image !== "string")
      fail(400, "cms_invalid_input");
    value.displayName = input.displayName.trim();
    value.profileImage = input.image.trim() ? { url: input.image.trim() } : null;
    if (input.officialProfileUrl !== undefined) {
      if (typeof input.officialProfileUrl !== "string") fail(400, "cms_invalid_input");
      value.officialProfileUrl = input.officialProfileUrl.trim() || null;
    }
    if (input.aliasNames !== undefined) {
      if (typeof input.aliasNames !== "string") fail(400, "cms_invalid_input");
      const names = [...new Set(input.aliasNames.split("\n").map((name) => name.trim()).filter(Boolean))];
      value.aliases = [
        ...value.aliases.filter((alias) => alias.type !== "alias" || alias.from || alias.to),
        ...names.filter((name) => !value.aliases.some((alias) =>
          alias.name === name && (alias.type !== "alias" || alias.from || alias.to)))
          .map((name) => ({ name, type: "alias", from: null, to: null })),
      ];
    }
    for (const [field, service] of [["youtubeUrl", "youtube"], ["xUrl", "x"]]) {
      if (input[field] === undefined) continue;
      if (typeof input[field] !== "string") fail(400, "cms_invalid_input");
      const supplied = input[field].trim();
      const index = value.accounts.findIndex((account) => account.service === service);
      const old = value.accounts[index];
      if ((old?.url || "") === supplied) continue;
      if (service === "youtube" && old?.accountId) fail(403, "cms_identity_anchor");
      if (!supplied) {
        if (old) value.accounts.splice(index, 1);
        continue;
      }
      let url;
      try { url = new URL(supplied); }
      catch { fail(400, "cms_invalid_input"); }
      const slug = service === "youtube" ? /^\/channel\/(UC[\w-]{22})$/.exec(url.pathname)?.[1]
        : /^\/([a-zA-Z0-9_]+)$/.exec(url.pathname)?.[1];
      // A channel URL alone does not prove ownership.
      if (service === "youtube" && slug) fail(403, "cms_identity_anchor");
      const account = { service, accountId: slug ?? null, url: supplied };
      if (old) value.accounts[index] = account;
      else value.accounts.push(account);
    }
    value.activityStatus = { value: input.activity };
    if (before && input.organization && input.organization !== talentFields(before).organization) {
      const current = value.affiliations.filter(({ status }) => status === "current");
      if (current.length !== 1) fail(403, "cms_scope_denied");
      current[0].status = "former";
      value.affiliations.push({ organizationId: input.organization, status: "current", from: null, to: null });
      value.agencyStatus = { value: "affiliated" };
      access.assertChange(entity, before, before);
    }
    access.assertChange(entity, before, value);
    const operation = { key: "cms-talent", entity, ...(id ? { id } : {}), value, before, baseCommit: snapshot.sha };
    const plan = await planSubmission(snapshot, [operation], { actor: "0", batchId: await hash(operation) });
    const after = cmsPermissions({ ...snapshot.models, ...plan.files }, member);
    for (const row of plan.impact.records) after.assertChange(entity, row.before, row.value);
    return [operation];
  }
  if (["campaign", "song"].includes(entity) && !before) fail(400, "cms_invalid_input");
  const value = structuredClone(before || (entity === "event" ? {
    type: "other", timing: "unknown", starts: unknown, ends: unknown,
    organizerIds: [], relatedOrganizationIds: [input.organization],
    groupIds: [], talentIds: [], lineupComplete: false, slots: [], videoIds: [],
    streamUrls: [], format: "unknown", fee: { amount: null, currency: null, note: null },
    visibility: "public",
  } : { talentIds: [input.talent], groupIds: [], visibility: "public",
    ...(entity === "anniversary" ? { recursYearly: true, countYears: false } : {}),
  }));
  let setlist = [];
  const newTracks = [];
  if (entity === "karaoke") {
    if (!before) delete value.groupIds;
    try { value.youtubeId = youtubeId(input.videoUrl); }
    catch { fail(400, "cms_invalid_video_url"); }
    if (!before) value.registeredAt = new Date().toISOString();
    if (!Array.isArray(input.setlist) || input.setlist.length > 55) fail(400, "cms_invalid_input");
    const existing = id ? snapshot.models.karaoke.performances.filter((row) => row.karaokeId === id) : [];
    if (existing.some((row) => !access.canRead("performance", row))) fail(403, "cms_scope_denied");
    const used = new Set();
    const keys = new Set();
    setlist = input.setlist.map((row, index) => {
      if (!row || typeof row.label !== "string" || !row.label.trim()) fail(400, "cms_invalid_input");
      const old = row.id && existing.find((item) => item.id === row.id);
      if (row.id && (!old || used.has(row.id))) fail(403, "cms_scope_denied");
      if (old) used.add(old.id);
      const key = old ? old.id : row.key || "new-" + index;
      if (typeof key !== "string" || !/^[a-z0-9-]{1,20}$/.test(key) || keys.has(key))
        fail(400, "cms_invalid_input");
      keys.add(key);
      const work = newSongOperation(row, "cms-work-" + key);
      if (work) newTracks.push(work);
      const time = (name) => {
        const value = row[name];
        if (value === undefined) return old?.[name] ?? null;
        if (value === "") return null;
        if (typeof value !== "string" || !/^\d{1,8}$/.test(value))
          fail(400, "cms_invalid_input");
        return Number(value);
      };
      return {
        key: "cms-track-" + key, entity: "performance",
        ...(old ? { id: old.id } : {}),
        value: {
          ...(old || { karaokeId: id || "@cms-karaoke", startsAtSeconds: null, endsAtSeconds: null,
            talentIds: value.talentIds, note: null, verification: "verified", visibility: "public" }),
          startsAtSeconds: time("startsAtSeconds"), endsAtSeconds: time("endsAtSeconds"),
          songId: work ? "@" + work.key : row.songId || null, rawLabel: row.label.trim(), order: index + 1,
        },
      };
    });
    if (used.size !== existing.length) fail(409, "cms_setlist_remove_not_supported");
    if (input.complete === true && setlist.length) {
      value.setlistStatus = "complete";
      value.expectedCount = setlist.length;
    } else if (input.complete === false || before?.setlistStatus !== "complete" || setlist.length !== before.expectedCount) {
      value.setlistStatus = setlist.length ? "partial" : "unreviewed";
      value.expectedCount = null;
    }
  }
  if (entity === "song") {
    if (typeof input.artists !== "string") fail(400, "cms_invalid_input");
    const names = [...new Set(input.artists.split("\n").map((name) => name.trim()).filter(Boolean))];
    value.originalArtists = names.length ? names : null;
  }
  if (entity === "musicVideo") {
    if (!before) delete value.groupIds;
    try { value.youtubeId = youtubeId(input.videoUrl); }
    catch { fail(400, "cms_invalid_video_url"); }
    value.type = input.videoKind;
    value.songId = input.songId || null;
    // A new association may only reuse an existing, scoped media record.
    // The shared permission resolver verifies its registered channel owner.
    if (!before) value.registeredAt = new Date().toISOString();
  }
  if (entity === "anniversary") {
    const { month, day, year, kind } = input;
    if (![month, day, year].every((part) => typeof part === "string" && /^\d*$/.test(part)))
      fail(400, "cms_invalid_input");
    value.date = { month: Number(month), day: Number(day), year: year ? Number(year) : null };
    value.type = kind;
  }
  for (const key of fields[entity]) {
    if (typeof input[key] !== "string") fail(400, "cms_invalid_input");
    value[key] = input[key].trim() || null;
  }
  if (entity === "event") {
    if (input.performers !== undefined) {
      if (!Array.isArray(input.performers) || input.performers.length > 100 ||
          input.performers.some((id) => typeof id !== "string" || !/^tal-\d{6}$/.test(id)))
        fail(400, "cms_invalid_input");
      value.talentIds = [...new Set(input.performers)];
      if (JSON.stringify(value.talentIds) !== JSON.stringify(before?.talentIds || []))
        value.lineupComplete = false;
    }
    for (const key of ["starts", "ends"]) {
      if (input[key] === undefined || (before && input[key] === eventFields(before)[key])) continue;
      if (typeof input[key] !== "string") fail(400, "cms_invalid_input");
      if (!input[key] && before?.[key]?.precision !== "instant") continue;
      if (input[key] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input[key]))
        fail(400, "cms_invalid_input");
      const instant = input[key] && new Date(input[key] + ":00+09:00");
      if (instant && !Number.isFinite(instant.getTime())) fail(400, "cms_invalid_input");
      value[key] = instant ? { precision: "instant", value: instant.toISOString() } : unknown;
    }
    if (input.format !== undefined) value.format = input.format;
    if (input.streamUrl !== undefined) {
      if (typeof input.streamUrl !== "string") fail(400, "cms_invalid_input");
      value.streamUrls = [...new Set([input.streamUrl.trim(), ...value.streamUrls.slice(1)].filter(Boolean))];
    }
    if (input.fee !== undefined) {
      if (typeof input.fee !== "string" || (input.fee && !/^\d+(?:\.\d+)?$/.test(input.fee)))
        fail(400, "cms_invalid_input");
      value.fee = { ...value.fee, amount: input.fee ? Number(input.fee) : null,
        currency: input.fee ? value.fee.currency || "JPY" : null };
    }
  }
  const operation = { key: "cms-" + entity.toLowerCase(), entity, ...(before ? { id } : {}), value };
  const operations = [operation, ...setlist, ...newTracks];
  if (["musicVideo", "karaoke"].includes(entity)) {
    if (!snapshot.models.media.videos.some((row) => row.youtubeId === value.youtubeId)) {
      const video = collectedVideo(snapshot.models, value.youtubeId);
      if (!access.canRead("video", video)) fail(403, "cms_scope_denied");
      operations.push({ key: "cms-media", entity: "video", value: video });
    }
    if (entity === "musicVideo") {
      const work = newSongOperation(input, "cms-new-song");
      if (work) {
        operations.push(work);
        value.songId = "@" + work.key;
      }
    }
  }
  if (entity === "product") {
    const existing = snapshot.models.goods.offers.filter((offer) => offer.productId === id);
    if (existing.some((offer) => !access.canRead("offer", offer))) fail(403, "cms_shared_goods");
    if (input.campaignTitle && (id || input.campaignId || typeof input.campaignTitle !== "string"))
      fail(400, "cms_invalid_input");
    assertExistingCampaign(snapshot.models, access, input.campaignId || null);
    const sales = input.sales ?? [{ ...input, id: existing[0]?.id }];
    if (!Array.isArray(sales) || sales.length > 40) fail(400, "cms_invalid_input");
    if ((input.campaignId || input.campaignTitle) && !sales.some((sale) => sale?.url))
      fail(400, "cms_invalid_input");
    const keys = new Set(), ids = new Set();
    for (const [index, sale] of sales.entries()) {
      if (!sale || typeof sale.url !== "string" || typeof sale.price !== "string" ||
          (sale.price && !/^\d+(?:\.\d+)?$/.test(sale.price))) fail(400, "cms_invalid_input");
      const old = sale.id && existing.find((offer) => offer.id === sale.id);
      if (sale.id && (!old || ids.has(sale.id))) fail(403, "cms_scope_denied");
      if (old) ids.add(old.id);
      if (!sale.url && !old && (input.sales === undefined || (!sale.price && !sale.startsAt && !sale.endsAt))) continue;
      if (!sale.url.trim()) fail(400, "cms_invalid_input");
      const key = sale.key ?? (index === 0 ? "cms-sale" : "cms-sale-" + (old?.id || "new-" + index));
      if (typeof key !== "string" || !/^cms-sale(?:-[a-z0-9-]{1,23})?$/.test(key) || keys.has(key))
        fail(400, "cms_invalid_input");
      keys.add(key);
      const campaignId = old ? old.campaignId
        : input.campaignTitle ? "@cms-campaign" : sale.campaignId || input.campaignId || null;
      if (!input.campaignTitle || campaignId !== "@cms-campaign")
        assertExistingCampaign(snapshot.models, access, campaignId);
      if (campaignId !== "@cms-campaign" && campaignId?.startsWith("@")) fail(400, "cms_invalid_input");
      const period = {};
      for (const field of ["startsAt", "endsAt"]) {
        if (sale[field] === undefined || sale[field] === localInstant(old?.[field])) continue;
        if (typeof sale[field] !== "string" ||
            (sale[field] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sale[field])))
          fail(400, "cms_invalid_input");
        const time = Date.parse(sale[field] + ":00+09:00");
        if (sale[field] && (!Number.isFinite(time) || localInstant(time) !== sale[field]))
          fail(400, "cms_invalid_input");
        period[field] = sale[field] ? new Date(time).toISOString() : null;
      }
      operations.push({
        key, entity: "offer", ...(old ? { id: old.id } : {}),
        value: {
          ...(old || { productId: id || "@cms-product", campaignId, startsAt: null, endsAt: null,
            periodNote: null, status: "unknown", visibility: "public" }),
          ...period, url: sale.url.trim(),
          price: { amount: sale.price ? Number(sale.price) : null, currency: sale.price ? old?.price.currency || "JPY" : null },
        },
      });
    }
    if (input.campaignTitle) operations.push({ key: "cms-campaign", entity: "campaign",
      value: { title: input.campaignTitle.trim(), visibility: "public" } });
  }
  const batch = { operations };
  await contentPreview(snapshot, {
    action: "batch", value: batch, confirmation: { status: "confirmed", valueHash: await hash(batch) },
  }, {
    actor: "0", references: () => [],
    authorize(beforeModels, afterModels, changes) {
      const previous = cmsPermissions(beforeModels, member);
      const next = cmsPermissions(afterModels, member);
      for (const { op, old, record } of changes) {
        if (old && !previous.canRead(op.entity, old)) fail(403, "cms_scope_denied");
        if (op.entity === "song") assertSongEdit(afterModels, next, record.id);
        else next.assertChange(op.entity, null, record);
      }
    },
  });
  return operations.map((op) => ({
    ...op, before: op.entity === "offer" && op.id ? snapshot.models.goods.offers.find((row) => row.id === op.id) : op === operation ? before : op.entity === "performance" && op.id
      ? snapshot.models.karaoke.performances.find((row) => row.id === op.id) : null, baseCommit: snapshot.sha,
  }));
}

function localInstant(value) {
  return value == null ? "" : new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 16);
}

function saleFields(offer, key, campaign) {
  return {
    id: offer.id, key, campaignId: campaign ? "" : offer.campaignId || "",
    startsAt: localInstant(offer.startsAt), endsAt: localInstant(offer.endsAt),
    url: offer.url, currency: offer.price.currency ?? "JPY", price: String(offer.price.amount ?? ""),
  };
}

function eventFields(record) {
  const local = (time) => time.precision === "instant"
    ? new Date(Date.parse(time.value) + 9 * 3600000).toISOString().slice(0, 16) : "";
  return { performers: record.talentIds, starts: local(record.starts), ends: local(record.ends), format: record.format,
    streamUrl: record.streamUrls[0] ?? "", fee: String(record.fee.amount ?? ""),
    feeCurrency: record.fee.currency ?? "JPY" };
}

const anniversaryFields = ({ date, type }) => ({
  month: String(date.month), day: String(date.day), year: String(date.year ?? ""), kind: type,
});

const musicVideoFields = (record) => ({
  videoUrl: "https://www.youtube.com/watch?v=" + record.youtubeId,
  videoKind: record.type,
  songId: record.songId || "",
});

const talentFields = (record) => ({
  organization: record.affiliations.find(({ status }) => status === "current")?.organizationId,
  officialProfileUrl: record.officialProfileUrl || "",
  aliasNames: record.aliases.filter((alias) => alias.type === "alias" && !alias.from && !alias.to)
    .map(({ name }) => name).join("\n"),
  youtubeUrl: record.accounts.find(({ service }) => service === "youtube")?.url || "",
  xUrl: record.accounts.find(({ service }) => service === "x")?.url || "",
  image: record.profileImage?.url || "",
  activity: record.activityStatus.value,
});

const setlistFields = (rows) => rows.map((row) => ({
  id: row.id, label: row.rawLabel, songId: row.songId || "",
  startsAtSeconds: String(row.startsAtSeconds ?? ""), endsAtSeconds: String(row.endsAtSeconds ?? ""),
}));

export function draftDetails(snapshot, member, entity, id) {
  if (!Object.hasOwn(draftTypes, entity)) fail(403, "cms_scope_denied");
  const [file, list] = draftTypes[entity];
  const record = snapshot.models[file][list].find((row) => row.id === id);
  if (!cmsPermissions(snapshot.models, member).canRead(entity, record)) fail(403, "cms_scope_denied");
  const details = Object.fromEntries(fields[entity].map((key) => [key, record[key] ?? ""]));
  if (entity === "karaoke") {
    const rows = snapshot.models.karaoke.performances.filter((row) => row.karaokeId === id);
    if (rows.some((row) => !cmsPermissions(snapshot.models, member).canRead("performance", row)))
      fail(403, "cms_scope_denied");
    details.videoUrl = musicVideoFields(record).videoUrl;
    details.complete = record.setlistStatus === "complete";
    details.setlist = setlistFields(rows.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
  }
  if (entity === "song") details.artists = (record.originalArtists || []).join("\n");
  if (entity === "musicVideo") Object.assign(details, musicVideoFields(record));
  if (entity === "talent") Object.assign(details, talentFields(record));
  if (entity === "anniversary") Object.assign(details, anniversaryFields(record));
  if (entity === "event") Object.assign(details, eventFields(record));
  if (entity === "product") {
    const offers = snapshot.models.goods.offers.filter((offer) => offer.productId === id);
    const access = cmsPermissions(snapshot.models, member);
    if (offers.some((offer) => !access.canRead("offer", offer))) fail(403, "cms_shared_goods");
    details.sales = offers.map((offer) => saleFields(offer));
  }
  return details;
}

export function draftInput(workspace) {
  const [op] = workspace?.operations || [];
  const offers = (workspace?.operations || []).filter((row) => row.entity === "offer");
  const sale = offers[0];
  const song = workspace?.operations.find((row) => row.entity === "song");
  const campaign = workspace?.operations.find((row) => row.entity === "campaign");
  if (!op || !Object.hasOwn(draftTypes, op.entity)) return null;
  return {
    entity: op.entity, id: op.id, sha: op.baseCommit,
    organization: op.value.relatedOrganizationIds?.[0],
    talent: op.value.talentIds?.[0],
    ...Object.fromEntries(fields[op.entity].map((key) => [key, op.value[key] ?? ""])),
    ...(op.entity === "karaoke" ? { videoUrl: musicVideoFields(op.value).videoUrl,
      complete: op.value.setlistStatus === "complete",
      setlist: workspace.operations.filter((row) => row.entity === "performance").map((row) => ({
        ...setlistFields([row.value])[0],
        ...newSongFields(workspace.operations.find((work) => work.entity === "song" && "@" + work.key === row.value.songId)),
        key: row.key.replace(/^cms-track-/, "").replace(/-[a-f0-9]{24}$/, ""),
      })) } : {}),
    ...(op.entity === "song" ? { artists: (op.value.originalArtists || []).join("\n") } : {}),
    ...(op.entity === "musicVideo" ? {
      ...musicVideoFields(op.value),
      ...newSongFields(song),
    } : {}),
    ...(op.entity === "talent" ? talentFields(op.value) : {}),
    ...(op.entity === "anniversary" ? anniversaryFields(op.value) : {}),
    ...(op.entity === "event" ? eventFields(op.value) : {}),
    ...(op.entity === "product" ? {
      startsAt: localInstant(sale?.value.startsAt), endsAt: localInstant(sale?.value.endsAt),
      sales: offers.map(({ key, value }) => saleFields(value, key.replace(/-[a-f0-9]{24}$/, ""), campaign)),
      campaignId: campaign || op.id ? "" : sale?.value.campaignId ?? "", campaignTitle: campaign?.value.title ?? "",
      url: sale?.value.url ?? "", currency: sale?.value.price.currency ?? "JPY", price: String(sale?.value.price.amount ?? ""),
    } : {}),
  };
}

export function draftGroups(operations = []) {
  const groups = new Map();
  for (const op of operations) {
    const match = /^cms-([a-z][a-z0-9-]*?)-([a-f0-9]{24})$/.exec(op.key) ||
      /^cms-(event|product|sale|anniversary|campaign)$/.exec(op.key);
    const key = match?.[2] || (match && (match[1] === "event" ? "legacy-event" : "legacy-product"));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(op);
  }
  return groups;
}

export function draftConflict(draftId, previous, replacement) {
  const suffix = draftId.startsWith("legacy-") ? "" : "-" + draftId;
  const saved = new Map(previous.map((op) => [op.key, op]));
  return replacement.some((op) => {
    const old = saved.get(op.key + suffix);
    return old &&
      (old.entity !== op.entity || old.id !== op.id ||
       JSON.stringify(old.before) !== JSON.stringify(op.before));
  });
}

export function writeDraft(operations, draftId, replacement) {
  const groups = draftGroups(operations);
  const primary = replacement?.[0];
  const existing = draftId ?? (primary?.id && [...groups].find(([, group]) =>
    group[0].id === primary.id && group[0].entity === primary.entity
  )?.[0]);
  if (draftId && !groups.has(draftId)) fail(409, "workspace_revision_conflict");
  const previous = groups.get(existing);
  if (previous && primary && (!replacement.some((op) => op.entity === previous[0].entity && op.id === previous[0].id &&
      op.key + (existing.startsWith("legacy-") ? "" : "-" + existing) === previous[0].key)))
    fail(409, "cms_draft_target_changed");
  if (previous && primary && draftConflict(existing, previous, replacement))
    fail(409, "main_changed_reload");
  if (previous && primary) replacement = [...replacement].sort((a, b) =>
    Number(b.key === previous[0].key.replace(/-[a-f0-9]{24}$/, "")) -
    Number(a.key === previous[0].key.replace(/-[a-f0-9]{24}$/, "")));
  const id = existing || crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  const suffix = id.startsWith("legacy-") ? "" : "-" + id;
  const names = new Map((replacement || []).map((op) => [op.key, "@" + op.key + suffix]));
  const next = replacement?.map((op) => ({
    ...op, key: op.key + suffix,
    value: resolveRefs(op.value, names, undefined, true),
    ...(op.parent ? { parent: { ...op.parent, reference: names.get(op.parent.reference.slice(1)) ?? op.parent.reference } } : {}),
  })) ?? [];
  return { id, operations: [
    ...operations.filter((op) => !previous?.includes(op)).map(({ validationState, ...op }) => op),
    ...next,
  ] };
}
