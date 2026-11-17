import validateAudit from "./audit.cjs";
import { contentTypes } from "./content-definitions.mjs";
import { nextId, resolveRefs, slots } from "./content-plan.mjs";
import { workspaceOperations } from "./workspace.mjs";
import validate from "./validate.cjs";
import { assertPrivateUnreferenced } from "../../lib/talent-publication.js";
import { hash, fail } from "./security.mjs";
export const entities = {
  ...contentTypes,
  talent: {
    file: "talents",
    list: "talents",
    prefix: "tal",
    registry: "talent-id-registry",
    label: "VTuber",
  },
  organization: {
    file: "talents",
    list: "organizations",
    prefix: "org",
    registry: "catalog-id-registry",
    label: "事務所",
  },
  group: {
    file: "catalog",
    list: "groups",
    prefix: "group",
    registry: "catalog-id-registry",
    label: "グループ",
  },
};
export const equal = (a, b) => {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a),
    other = Object.keys(b);
  return (
    keys.length === other.length &&
    keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
  );
};
export const recordAt = (models, op) =>
  models[entities[op.entity].file][entities[op.entity].list].find(
    (r) => r[entities[op.entity].field || "id"] === op.id,
  ) || null;
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
export function threeWay(base, ours, theirs, path = "") {
  if (equal(ours, base))
    return { value: structuredClone(theirs), conflicts: [] };
  if (equal(theirs, base) || equal(ours, theirs))
    return { value: structuredClone(ours), conflicts: [] };
  if (plain(base) && plain(ours) && plain(theirs)) {
    const value = {},
      conflicts = [];
    for (const k of new Set([
      ...Object.keys(base),
      ...Object.keys(ours),
      ...Object.keys(theirs),
    ])) {
      const r = threeWay(base[k], ours[k], theirs[k], path + "/" + k);
      if (r.value !== undefined) value[k] = r.value;
      conflicts.push(...r.conflicts);
    }
    return { value, conflicts };
  }
  return {
    value: structuredClone(ours),
    conflicts: [{ field: path || "/", base, ours, theirs }],
  };
}
export { operationDependencies as dependencies } from "../public/workspace.js";
import { operationDependencies as dependencies } from "../public/workspace.js";

function allocate(models, op) {
  const t = entities[op.entity];
  if (op.id) return op.id;
  if (op.entity === "video") return op.value.youtubeId;
  if (op.entity === "talent") {
    const issued = models["talent-id-registry"].issued,
      ids = [
        ...issued.map((x) => x.id),
        ...models.talents.talents.map((x) => x.id),
      ];
    const n = Math.max(0, ...ids.map((x) => Number(x.slice(4)))) + 1;
    if (n > 999999) fail(409, "id_space_exhausted");
    const id = "tal-" + String(n).padStart(6, "0"),
      channel =
        op.value.accounts?.find((a) => a.service === "youtube" && a.accountId)
          ?.accountId || null;
    const official =
      op.value.officialProfileUrl ||
      op.value.accounts?.find((a) => /^https:\/\//.test(a.url))?.url ||
      null;
    if (
      issued.some(
        (r) =>
          (channel && r.youtubeChannelId === channel) ||
          (!channel && official && r.officialProfileUrl === official),
      )
    )
      fail(409, "identity_already_reserved");
    issued.push({
      id,
      youtubeChannelId: channel,
      officialProfileUrl: official,
    });
    return id;
  }
  return nextId(models, t.prefix, t.registry);
}
export async function planSubmission(
  snapshot,
  values,
  {
    actor,
    batchId,
    branchId = batchId,
    reason = null,
    at = new Date().toISOString(),
  } = {},
) {
  const ops = workspaceOperations(values).map(
      ({ validationState, ...op }) => op,
    ),
    before = snapshot.models,
    models = structuredClone(before),
    ids = new Map(),
    records = [],
    conflicts = [];
  const deps = dependencies(ops);
  for (const op of ops)
    for (const key of deps[op.key])
      if (!ops.some((o) => o.key === key))
        fail(409, "missing_dependency:" + key);
  for (const op of ops) {
    const current = op.id ? recordAt(before, op) : null;
    if (op.id && !current) {
      conflicts.push({
        key: op.key,
        entity: op.entity,
        id: op.id,
        field: "/",
        base: op.before,
        ours: op.value,
        theirs: null,
      });
      continue;
    }
    const merged = op.id
      ? threeWay(op.before, op.value, current)
      : { value: structuredClone(op.value), conflicts: [] };
    conflicts.push(
      ...merged.conflicts.map((c) => ({
        ...c,
        key: op.key,
        entity: op.entity,
        id: op.id,
      })),
    );
    op.value = merged.value;
    ids.set(op.key, allocate(models, op));
  }
  if (conflicts.length)
    return {
      conflicts,
      baseCommit: snapshot.sha,
      currentRecords: ops
        .filter((o) => o.id)
        .map((o) => ({
          key: o.key,
          before: recordAt(before, o),
          value: o.value,
        })),
    };
  for (const op of ops) {
    const t = entities[op.entity],
      field = t.field || "id",
      id = ids.get(op.key),
      old = op.id ? recordAt(before, op) : null,
      record = resolveRefs(op.value, ids);
    record[field] = id;
    if (!old && models[t.file][t.list].some((r) => r[field] === id))
      fail(409, "record_exists_select_existing");
    if (op.entity === "event") slots(models, record, old);
    if (op.entity === "talent") {
      if (
        old?.affiliations.some(
          (a) =>
            !record.affiliations?.some(
              (b) => a.organizationId === b.organizationId,
            ),
        )
      )
        fail(409, "affiliation_history_must_be_retained");
      if (
        !old &&
        !record.accounts?.some((a) => a.service === "youtube" && a.accountId) &&
        !record.officialProfileUrl
      ) {
        const url = models["talent-id-registry"].issued.find(
          (r) => r.id === id,
        )?.officialProfileUrl;
        if (url) record.officialProfileUrl = url;
      }
    }
    if (
      !old &&
      ["musicVideo", "karaoke"].includes(op.entity) &&
      !record.registeredAt
    )
      record.registeredAt = at;
    const rows = models[t.file][t.list],
      index = rows.findIndex((r) => r[field] === id);
    if (index < 0) rows.push(record);
    else rows[index] = record;
    const fields = Object.keys({ ...old, ...record }).filter(
      (k) => !equal(old?.[k], record[k]),
    );
    if (fields.length)
      records.push({
        key: op.key,
        entity: op.entity,
        id,
        label:
          record.displayName ||
          record.name ||
          record.title ||
          record.rawSongTitle ||
          id,
        action: old ? "edit" : "create",
        fields,
        before: old,
        value: record,
        visibilityChanged: !!old && old.visibility !== record.visibility,
      });
  }
  for (const op of ops)
    if (op.parent) {
      if (
        { offer: "product", performance: "karaoke", product: "campaign" }[
          op.entity
        ] !== op.parent.entity
      )
        fail(409, "parent_relationship_mismatch");
      const parent = op.parent.reference.startsWith("@")
          ? ids.get(op.parent.reference.slice(1))
          : op.parent.reference,
        id = ids.get(op.key),
        record = recordAt(models, { ...op, id });
      if (
        (op.entity === "offer" &&
          (op.parent.entity !== "product" || record.productId !== parent)) ||
        (op.entity === "performance" &&
          (op.parent.entity !== "karaoke" || record.karaokeId !== parent)) ||
        (op.entity === "product" &&
          (op.parent.entity !== "campaign" ||
            !models.goods.offers.some(
              (o) => o.productId === id && o.campaignId === parent,
            )))
      )
        fail(409, "parent_relationship_mismatch");
    }
  const signatures = new Set();
  for (const o of models.goods.offers) {
    const sig = JSON.stringify([
      o.productId,
      o.campaignId,
      o.url,
      o.startsAt,
      o.endsAt,
      o.price?.amount,
      o.price?.currency,
      o.periodNote,
    ]);
    if (signatures.has(sig)) fail(409, "duplicate_offer");
    signatures.add(sig);
  }
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
  if (!records.length) fail(400, "no_changes");
  const files = {},
    diff = [];
  for (const name of Object.keys(before))
    if (!equal(before[name], models[name])) {
      files[name] = models[name];
      diff.push({ file: name, before: before[name], after: models[name] });
    }
  return finalizeAudit(
    {
      files,
      diff,
      impact: {
        records,
        references: [],
        publicPages: [
          ...new Set(
            records.map((r) =>
              r.entity === "talent"
                ? "/talents/" + r.id + "/"
                : {
                    anniversary: "/anniversaries/",
                    event: "/events/",
                    campaign: "/goods/",
                    product: "/goods/",
                    offer: "/goods/",
                  }[r.entity] || "/music/",
            ),
          ),
        ],
      },
    },
    snapshot,
    { actor, batchId, branchId, reason, at, operations: values },
  );
}
export async function finalizeAudit(
  plan,
  snapshot,
  {
    actor,
    batchId,
    reason = null,
    at = new Date().toISOString(),
    operations = [],
    branchId = batchId,
  } = {},
) {
  const ledger = plan.files["admin-ledger"];
  const legacyEntry = ledger?.entries.find(
    (e) =>
      !snapshot.models["admin-ledger"].entries.some((old) => old.id === e.id),
  );
  if (ledger) {
    ledger.entries = structuredClone(snapshot.models["admin-ledger"].entries);
    if (equal(ledger, snapshot.models["admin-ledger"])) {
      delete plan.files["admin-ledger"];
      plan.diff = plan.diff.filter((d) => d.file !== "admin-ledger");
    } else {
      const d = plan.diff.find((d) => d.file === "admin-ledger");
      if (d) d.after = ledger;
    }
  }
  const rawRecords =
    plan.impact.records ||
    plan.diff.flatMap((d) => {
      if (d.file.includes("registry") || d.file === "admin-ledger") return [];
      return Object.keys(d.after).flatMap((list) =>
        Array.isArray(d.after[list])
          ? d.after[list]
              .filter(
                (r) => r && typeof r === "object" && (r.id || r.youtubeId),
              )
              .flatMap((r) => {
                const old = d.before[list]?.find(
                  (v) => (v.id || v.youtubeId) === (r.id || r.youtubeId),
                );
                if (equal(old, r)) return [];
                const entity = Object.keys(entities).find(
                  (k) =>
                    entities[k].file === d.file && entities[k].list === list,
                );
                return entity
                  ? [
                      {
                        key: operations[0]?.key || "legacy",
                        entity,
                        id: r.id || r.youtubeId,
                        label: r.displayName || r.name || r.title || r.id,
                        action: old ? "edit" : "create",
                        fields: Object.keys(r).filter(
                          (k) => !equal(old?.[k], r[k]),
                        ),
                        before: old || null,
                        value: r,
                        visibilityChanged:
                          !!old && old.visibility !== r.visibility,
                      },
                    ]
                  : [];
              })
          : [],
      );
    });
  if (
    legacyEntry &&
    legacyEntry.entity !== "content" &&
    (!rawRecords.length || ["delete", "merge"].includes(legacyEntry.action))
  ) {
    const t = entities[legacyEntry.entity],
      before =
        snapshot.models[t.file][t.list].find(
          (r) => r.id === legacyEntry.subject,
        ) || null;
    const value =
      (plan.files[t.file] || snapshot.models[t.file])[t.list].find(
        (r) => r.id === legacyEntry.subject,
      ) || null;
    if (!rawRecords.some((r) => r.id === legacyEntry.subject))
      rawRecords.push({
        entity: legacyEntry.entity,
        id: legacyEntry.subject,
        key: "legacy",
        label: before?.displayName || before?.name || legacyEntry.subject,
        before,
        value,
        action: legacyEntry.action,
        fields: legacyEntry.changedFields,
      });
  }
  const records = rawRecords.map((r, i) => {
    const t = entities[r.entity],
      d = plan.diff.find((d) => d.file === t?.file),
      field = t?.field || "id";
    const before =
      r.before ?? d?.before?.[t?.list]?.find((v) => v[field] === r.id) ?? null;
    const value =
      r.value ?? d?.after?.[t?.list]?.find((v) => v[field] === r.id) ?? null;
    return {
      ...r,
      key:
        r.key ||
        operations.find((o) => o.entity === r.entity && o.id === r.id)?.key ||
        "legacy-" + i,
      before,
      value,
      action: r.action || (before ? "edit" : "create"),
      visibilityChanged: !!before && before.visibility !== value?.visibility,
    };
  });
  const audit = {
    version: 2,
    batchId,
    actor,
    createdAt: at,
    baseCommit: snapshot.sha,
    reason: reason?.trim() || null,
    submissionId: branchId,
    branch: "admin/change-" + branchId,
    operations: records.map((r) => ({
      operationId: r.key,
      entity: r.entity,
      recordId: r.id,
      action: r.action,
      changedFields: r.fields,
      before: r.before ?? null,
      after: r.value ?? null,
    })),
  };
  validateAudit(audit, batchId);
  plan.files["audit:" + batchId] = audit;
  plan.impact.records = records;
  const counts = {};
  for (const r of records) {
    const label = entities[r.entity]?.label || r.entity;
    counts[label] = (counts[label] || 0) + 1;
  }
  plan.title =
    Object.entries(counts)
      .map(([k, v]) => k + v + "件")
      .join("・")
      .slice(0, 160) + "を更新";
  plan.summary =
    `${Object.entries(counts)
      .map(([k, v]) => k + ": " + v + "件")
      .join(
        " / ",
      )}\n新規 ${records.filter((r) => r.action === "create").length}件 / 編集 ${records.filter((r) => r.action === "edit").length}件 / 公開状態変更 ${records.filter((r) => r.visibilityChanged).length}件\n` +
    records
      .map((r) => `- ${r.id}: ${r.label} (${r.fields.join(", ")})`)
      .join("\n") +
    `\n\n影響: ${(plan.impact.publicPages || []).join(" ")}\n全マスターのSchema v2・意味・参照・公開制御を検証済み。\nBase: ${snapshot.sha}\nActor: ${actor}\nBatch: ${batchId}` +
    (reason?.trim() ? "\n理由: " + reason.trim() : "");
  return plan;
}
