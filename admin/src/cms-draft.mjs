import { contentPreview } from "./content-plan.mjs";
import { cmsPermissions } from "./cms-scope.mjs";
import { fail, hash } from "./security.mjs";

export const draftTypes = { event: ["events", "events"], product: ["goods", "products"] };
const unknown = { precision: "unknown", value: null };
const fields = {
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
  const value = structuredClone(before || (entity === "event" ? {
    type: "other", timing: "unknown", starts: unknown, ends: unknown,
    organizerIds: [], relatedOrganizationIds: [input.organization],
    groupIds: [], talentIds: [], lineupComplete: false, slots: [], videoIds: [],
    streamUrls: [], format: "unknown", fee: { amount: null, currency: null, note: null },
    visibility: "public",
  } : { talentIds: [input.talent], groupIds: [], visibility: "public" }));
  for (const key of fields[entity]) {
    if (typeof input[key] !== "string") fail(400, "cms_invalid_input");
    value[key] = input[key].trim() || null;
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
        (input.price && !/^\d+$/.test(input.price))) fail(400, "cms_invalid_input");
    if (input.url || oldOffer) operations.push({
      key: "cms-sale", entity: "offer", ...(oldOffer ? { id: oldOffer.id } : {}),
      value: {
        ...(oldOffer || { productId: id || "@cms-product", campaignId: null, startsAt: null, endsAt: null,
          periodNote: null, status: "unknown", visibility: "public" }),
        url: input.url.trim(),
        price: { amount: input.price ? Number(input.price) : null, currency: input.price ? "JPY" : null },
      },
    });
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

export function draftDetails(snapshot, member, entity, id) {
  if (!Object.hasOwn(draftTypes, entity)) fail(403, "cms_scope_denied");
  const [file, list] = draftTypes[entity];
  const record = snapshot.models[file][list].find((row) => row.id === id);
  if (!cmsPermissions(snapshot.models, member).canRead(entity, record)) fail(403, "cms_scope_denied");
  const details = Object.fromEntries(fields[entity].map((key) => [key, record[key] ?? ""]));
  if (entity === "product") {
    const offers = snapshot.models.goods.offers.filter((offer) => offer.productId === id);
    if (offers.length > 1 || offers.some((offer) => offer.campaignId !== null || offer.visibility !== "public"))
      fail(403, "cms_shared_goods");
    details.url = offers[0]?.url ?? "";
    details.price = String(offers[0]?.price.amount ?? "");
  }
  return details;
}

export function draftInput(workspace) {
  const [op, sale] = workspace?.operations || [];
  if (!op || !Object.hasOwn(draftTypes, op.entity)) return null;
  return {
    entity: op.entity, id: op.id, sha: op.baseCommit,
    organization: op.value.relatedOrganizationIds?.[0],
    talent: op.value.talentIds?.[0],
    ...Object.fromEntries(fields[op.entity].map((key) => [key, op.value[key] ?? ""])),
    ...(op.entity === "product" ? {
      url: sale?.value.url ?? "", price: String(sale?.value.price.amount ?? ""),
    } : {}),
  };
}
