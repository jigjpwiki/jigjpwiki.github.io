import { planSubmission } from "./submission-plan.mjs";
import { contentPreview, resolveRefs } from "./content-plan.mjs";
import { cmsPermissions, assertExistingCampaign } from "./cms-scope.mjs";
import { fail, hash } from "./security.mjs";

export const draftTypes = { talent: ["talents", "talents"], event: ["events", "events"], product: ["goods", "products"], anniversary: ["anniversaries", "events"], campaign: ["goods", "campaigns"] };
const unknown = { precision: "unknown", value: null };
const fields = {
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
    await planSubmission(snapshot, [operation], { actor: "0", batchId: await hash(operation) });
    return [operation];
  }
  if (entity === "campaign" && !before) fail(400, "cms_invalid_input");
  const value = structuredClone(before || (entity === "event" ? {
    type: "other", timing: "unknown", starts: unknown, ends: unknown,
    organizerIds: [], relatedOrganizationIds: [input.organization],
    groupIds: [], talentIds: [], lineupComplete: false, slots: [], videoIds: [],
    streamUrls: [], format: "unknown", fee: { amount: null, currency: null, note: null },
    visibility: "public",
  } : { talentIds: [input.talent], groupIds: [], visibility: "public",
    ...(entity === "anniversary" ? { recursYearly: true, countYears: false } : {}),
  }));
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
  const operation = { key: "cms-" + entity, entity, ...(before ? { id } : {}), value };
  const operations = [operation];
  let oldOffer;
  if (entity === "product") {
    const offers = snapshot.models.goods.offers.filter((offer) => offer.productId === id);
    if (offers.length > 1 || offers.some((offer) => offer.campaignId !== null))
      fail(403, "cms_shared_goods");
    [oldOffer] = offers;
    if (typeof input.url !== "string" || typeof input.price !== "string" ||
        (input.price && !/^\d+(?:\.\d+)?$/.test(input.price))) fail(400, "cms_invalid_input");
    assertExistingCampaign(snapshot.models, access, input.campaignId || null);
    if (input.campaignId && input.campaignTitle) fail(400, "cms_invalid_input");
    if (id && (input.campaignId || input.campaignTitle)) fail(403, "cms_shared_goods");
    if ((input.campaignId || input.campaignTitle) && !input.url) fail(400, "cms_invalid_input");
    const period = {};
    for (const key of ["startsAt", "endsAt"]) {
      if (input[key] === undefined || input[key] === localInstant(oldOffer?.[key])) continue;
      if (typeof input[key] !== "string" ||
          (input[key] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input[key])))
        fail(400, "cms_invalid_input");
      const time = Date.parse(input[key] + ":00+09:00");
      if (input[key] && (!Number.isFinite(time) || localInstant(time) !== input[key]))
        fail(400, "cms_invalid_input");
      period[key] = input[key] ? new Date(time).toISOString() : null;
    }
    if (input.url || oldOffer) operations.push({
      key: "cms-sale", entity: "offer", ...(oldOffer ? { id: oldOffer.id } : {}),
      value: {
        ...(oldOffer || { productId: id || "@cms-product", campaignId: input.campaignTitle ? "@cms-campaign" : input.campaignId || null, startsAt: null, endsAt: null,
          periodNote: null, status: "unknown", visibility: "public" }),
        ...period,
        url: input.url.trim(),
        price: { amount: input.price ? Number(input.price) : null, currency: input.price ? oldOffer?.price.currency || "JPY" : null },
      },
    });
    if (input.campaignTitle) {
      if (typeof input.campaignTitle !== "string") fail(400, "cms_invalid_input");
      operations.push({ key: "cms-campaign", entity: "campaign",
        value: { title: input.campaignTitle.trim(), visibility: "public" } });
    }
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
        next.assertChange(op.entity, null, record);
      }
    },
  });
  return operations.map((op) => ({
    ...op, before: op.entity === "offer" ? oldOffer || null : before, baseCommit: snapshot.sha,
  }));
}

function localInstant(value) {
  return value == null ? "" : new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 16);
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

const talentFields = (record) => ({
  organization: record.affiliations.find(({ status }) => status === "current")?.organizationId,
  officialProfileUrl: record.officialProfileUrl || "",
  image: record.profileImage?.url || "",
  activity: record.activityStatus.value,
});

export function draftDetails(snapshot, member, entity, id) {
  if (!Object.hasOwn(draftTypes, entity)) fail(403, "cms_scope_denied");
  const [file, list] = draftTypes[entity];
  const record = snapshot.models[file][list].find((row) => row.id === id);
  if (!cmsPermissions(snapshot.models, member).canRead(entity, record)) fail(403, "cms_scope_denied");
  const details = Object.fromEntries(fields[entity].map((key) => [key, record[key] ?? ""]));
  if (entity === "talent") Object.assign(details, talentFields(record));
  if (entity === "anniversary") Object.assign(details, anniversaryFields(record));
  if (entity === "event") Object.assign(details, eventFields(record));
  if (entity === "product") {
    const offers = snapshot.models.goods.offers.filter((offer) => offer.productId === id);
    if (offers.length > 1 || offers.some((offer) => offer.campaignId !== null || offer.visibility !== "public"))
      fail(403, "cms_shared_goods");
    details.startsAt = localInstant(offers[0]?.startsAt);
    details.endsAt = localInstant(offers[0]?.endsAt);
    details.url = offers[0]?.url ?? "";
    details.currency = offers[0]?.price.currency ?? "JPY";
    details.price = String(offers[0]?.price.amount ?? "");
  }
  return details;
}

export function draftInput(workspace) {
  const [op, sale] = workspace?.operations || [];
  const campaign = workspace?.operations.find((row) => row.entity === "campaign");
  if (!op || !Object.hasOwn(draftTypes, op.entity)) return null;
  return {
    entity: op.entity, id: op.id, sha: op.baseCommit,
    organization: op.value.relatedOrganizationIds?.[0],
    talent: op.value.talentIds?.[0],
    ...Object.fromEntries(fields[op.entity].map((key) => [key, op.value[key] ?? ""])),
    ...(op.entity === "talent" ? talentFields(op.value) : {}),
    ...(op.entity === "anniversary" ? anniversaryFields(op.value) : {}),
    ...(op.entity === "event" ? eventFields(op.value) : {}),
    ...(op.entity === "product" ? {
      startsAt: localInstant(sale?.value.startsAt), endsAt: localInstant(sale?.value.endsAt),
      campaignId: campaign ? "" : sale?.value.campaignId ?? "", campaignTitle: campaign?.value.title ?? "",
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
