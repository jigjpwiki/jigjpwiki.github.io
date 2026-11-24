import { contentTypes } from "./content-definitions.mjs";
import validate from "./validate.cjs";
import migration from "../../lib/source-migration.js";
import { assertPrivateUnreferenced } from "../../lib/talent-publication.js";
import { hash, fail } from "./security.mjs";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refFields = new Set([
  "talentIds",
  "organizationIds",
  "organizationId",
  "groupIds",
  "songId",
  "karaokeId",
  "productId",
  "campaignId",
  "youtubeId",
  "videoIds",
]);
const types = contentTypes;
export function nextId(models, prefix, registry) {
  const issued = models[registry].issued;
  // Reserved IDs and all extant IDs (including nested event slots) are both considered.
  const ids = [
    ...issued,
    ...models.talents.organizations.map((o) => o.id),
    ...(models["admin-ledger"].issuedOrganizations || []),
    ...Object.values(types)
      .filter((t) => t.prefix)
      .flatMap((t) => models[t.file][t.list].map((r) => r.id)),
    ...models.events.events.flatMap((e) => e.slots.map((s) => s.id)),
  ];
  const numbers = ids
    .filter((id) => new RegExp("^" + prefix + "-[0-9]{6}$").test(id))
    .map((id) => Number(id.slice(prefix.length + 1)));
  const n = Math.max(0, ...numbers) + 1;
  if (n > 999999) fail(409, "id_space_exhausted");
  const id = prefix + "-" + String(n).padStart(6, "0");
  issued.push(id);
  return id;
}
export function resolveRefs(value, ids, field) {
  if (
    typeof value === "string" &&
    value.startsWith("@") &&
    refFields.has(field)
  ) {
    if (!ids.has(value.slice(1))) fail(400, "missing_batch_reference");
    return ids.get(value.slice(1));
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, ids, field));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveRefs(v, ids, k)]),
    );
  return value;
}
export function slots(models, record, old) {
  if (
    !Array.isArray(record.slots) ||
    record.slots.some((s) => !s || typeof s !== "object" || Array.isArray(s))
  )
    fail(400, "invalid_slots");
  for (const prior of old?.slots || [])
    if (!record.slots?.some((s) => s.id === prior.id))
      fail(409, "slot_history_must_be_retained");
  for (const slot of record.slots || []) {
    if (slot.id) {
      if (!old?.slots.some((s) => s.id === slot.id))
        fail(409, "stable_slot_id_required");
    } else slot.id = nextId(models, "slot", "feature-id-registry");
  }
}
export async function contentPreview(snapshot, input, { actor, references, authorize }) {
  if (
    !input ||
    Object.keys(input).some(
      (k) =>
        ![
          "sha",
          "entity",
          "action",
          "value",
          "reason",
          "confirmation",
        ].includes(k),
    ) ||
    input.action !== "batch" ||
    (input.reason != null && typeof input.reason !== "string") ||
    (input.reason?.length || 0) > 500 ||
    !input.value ||
    Object.keys(input.value).some((k) => k !== "operations") ||
    !Array.isArray(input.value.operations) ||
    !input.value.operations.length ||
    input.value.operations.length > 60
  )
    fail(400, "invalid_content_batch");
  if (
    input.confirmation?.status !== "confirmed" ||
    input.confirmation.valueHash !== (await hash(input.value))
  )
    fail(400, "field_confirmation_required");
  const before = migration.migrateModels(snapshot.models),
    models = structuredClone(before),
    ids = new Map(),
    seen = new Set(),
    changes = [];
  for (const op of input.value.operations) {
    if (
      !op ||
      Object.keys(op).some(
        (k) => !["entity", "id", "key", "value", "parent"].includes(k),
      ) ||
      !Object.hasOwn(types, op.entity) ||
      !/^[a-z][a-z0-9-]{0,40}$/.test(op.key || "") ||
      ids.has(op.key) ||
      !op.value ||
      typeof op.value !== "object" ||
      Array.isArray(op.value)
    )
      fail(400, "invalid_content_operation");
    const t = types[op.entity],
      field = t.field || "id",
      rows = models[t.file][t.list],
      old = op.id ? rows.find((r) => r[field] === op.id) : null;
    if (op.id && !old) fail(409, "unknown_id");
    if (
      (old && op.value[field] !== undefined && op.value[field] !== op.id) ||
      (!old && t.prefix && op.value.id !== undefined)
    )
      fail(409, "stable_id_required");
    const id =
      old?.[field] ||
      (t.prefix ? nextId(models, t.prefix, t.registry) : op.value.youtubeId);
    if (typeof id !== "string" || seen.has(op.entity + ":" + id))
      fail(409, "duplicate_content_operation");
    if (!old && rows.some((r) => r[field] === id))
      fail(409, "record_exists_select_existing");
    ids.set(op.key, id);
    seen.add(op.entity + ":" + id);
    changes.push({ op, t, old, id, field });
  }
  for (const change of changes) {
    const { op, t, old, id, field } = change,
      record = resolveRefs(structuredClone(op.value), ids);
    record[field] = id;
    if (op.entity === "event") slots(models, record, old);
    if (
      ["musicVideo", "karaoke"].includes(op.entity) &&
      !old &&
      record.registeredAt === undefined
    )
      record.registeredAt = new Date().toISOString();
    const rows = models[t.file][t.list];
    if (old) rows[rows.indexOf(old)] = record;
    else rows.push(record);
    change.record = record;
  }
  // Workspace context prevents a child being silently attached to a different parent.
  for (const { op, id, record } of changes)
    if (op.parent) {
      const p = op.parent,
        pairs = {
          product: "campaign",
          offer: "product",
          performance: "karaoke",
        };
      if (
        !p ||
        Object.keys(p).some((k) => !["entity", "reference"].includes(k)) ||
        pairs[op.entity] !== p.entity ||
        typeof p.reference !== "string"
      )
        fail(400, "invalid_parent_context");
      const parent = p.reference.startsWith("@")
        ? ids.get(p.reference.slice(1))
        : p.reference;
      if (!parent) fail(400, "missing_parent_reference");
      if (
        (op.entity === "product" &&
          !models.goods.offers.some(
            (o) => o.productId === id && o.campaignId === parent,
          )) ||
        (op.entity === "offer" && record.productId !== parent) ||
        (op.entity === "performance" && record.karaokeId !== parent)
      )
        fail(409, "parent_relationship_mismatch");
    }
  // Exact duplicate offers (even with different availability labels) are almost always accidental.
  const signatures = new Set();
  for (const o of models.goods.offers) {
    const key = JSON.stringify([
      o.productId,
      o.campaignId,
      o.url,
      o.startsAt,
      o.endsAt,
      o.price?.amount,
      o.price?.currency,
      o.periodNote,
    ]);
    if (signatures.has(key)) fail(409, "duplicate_offer");
    signatures.add(key);
  }
  authorize?.(before, models, changes);
  try {
    validate(models, before);
    assertPrivateUnreferenced(models.talents, [
      models.catalog,
      models.anniversaries,
      models.events,
      models.music,
      models.karaoke,
      models.goods,
    ]);
  } catch (e) {
    fail(400, "validation: " + e.message.slice(0, 600));
  }
  const files = {},
    diff = [];
  for (const name of Object.keys(before))
    if (!equal(before[name], models[name])) {
      files[name] = models[name];
      diff.push({ file: name, before: before[name], after: models[name] });
    }
  if (!diff.length) fail(400, "no_changes");
  const ledger = models["admin-ledger"];
  if (ledger.entries.length >= 2000) fail(409, "audit_archive_required");
  const records = changes
    .filter((c) => !equal(c.old, c.record))
    .map((c) => ({
      entity: c.op.entity,
      id: c.id,
      label:
        c.record.title || c.record.rawSongTitle || c.record.rawLabel || c.id,
      fields: Object.keys(c.record).filter(
        (k) => !equal(c.old?.[k], c.record[k]),
      ),
    }));
  ledger.entries.push({
    id: await hash({ sha: snapshot.sha, input }),
    actor,
    entity: "content",
    subject: records.map((r) => r.id).join(", "),
    action: "batch",
    reason: input.reason?.trim() || null,
    changedFields: records.flatMap((r) =>
      r.fields.map((f) => r.entity + "/" + r.id + "/" + f),
    ),
    at: new Date().toISOString(),
  });
  files["admin-ledger"] = ledger;
  diff.push({
    file: "admin-ledger",
    before: before["admin-ledger"],
    after: ledger,
  });
  const impact = {
    records,
    references: changes.flatMap((c) => (c.old ? references(before, c.id) : [])),
    accountReferences: [],
    publicPages: [
      ...new Set(
        records.map(
          (r) =>
            ({
              anniversary: "/anniversaries/",
              song: "/music/",
              musicVideo: "/music/",
              video: "/music/",
              karaoke: "/music/karaoke/",
              performance: "/music/karaoke/",
              event: "/events/",
              campaign: "/goods/",
              product: "/goods/",
              offer: "/goods/",
            })[r.entity],
        ),
      ),
    ],
    note: "全レコードを同時検証します。過去の履歴・ID台帳・対象外のレコードは削除しません。",
  };
  return {
    contentProtocol: 1,
    migrationPending: migration.names.some(
      (n) => snapshot.models[n]?.schemaVersion !== 2,
    ),
    files,
    diff,
    impact,
    title:
      Array.from(
        records
          .map((r) => r.label)
          .slice(0, 3)
          .join("・")
          .replace(/\s+/g, " "),
      )
        .slice(0, 180)
        .join("") + " / コンテンツ更新",
    summary: `${records.length}件を一括更新\n理由: ${input.reason}\n全マスターのSchema v2・参照・公開制御を検証済み。`,
  };
}
