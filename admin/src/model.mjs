import {assertPrivateUnreferenced} from "../../lib/talent-publication.js";
import talentsSchema from "../../schemas/talents.schema.json" with { type: "json" };
import catalogSchema from "../../schemas/catalog.schema.json" with { type: "json" };
import { contentForms } from "./content-definitions.mjs";
import { contentPreview } from "./content-plan.mjs";
export const forms = {
  content: contentForms,
  talent: talentsSchema.$defs.talent,
  organization: talentsSchema.$defs.organization,
  group: catalogSchema.properties.groups.items,
  definitions: talentsSchema.$defs,
};
import validate from "./validate.cjs";
import talentLib from "../../lib/talents.js";
import migration from "../../lib/source-migration.js";
import { hash, fail } from "./security.mjs";
const lists = {
  talent: ["talents", "talents", "tal"],
  organization: ["talents", "organizations", "org"],
  group: ["catalog", "groups", "group"],
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function references(models, id) {
  const rows = [];
  function scan(v, path, file) {
    if (v === id) {
      rows.push({ file, path });
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => scan(x, path + "/" + i, file));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) scan(x, path + "/" + k, file);
  }
  for (const [file, data] of Object.entries(models)) {
    if (file.includes("registry") || file === "admin-ledger") continue;
    scan(data, "", file);
  }
  return rows.filter(
    (r) =>
      !(/^\/talents\/\d+\/id$/.test(r.path) && r.file === "talents") &&
      !(/^\/organizations\/\d+\/id$/.test(r.path) && r.file === "talents") &&
      !(/^\/groups\/\d+\/id$/.test(r.path) && r.file === "catalog"),
  );
}
export function accountUsage(models, talent) {
  const keys = new Set(
    talent.accounts
      .map((a) => a.accountId)
      .filter(Boolean)
      .map((x) => x.toLowerCase()),
  );
  const out = [];
  function scan(value, path, file) {
    if (typeof value === "string" && keys.has(value.toLowerCase()))
      out.push({ file, path });
    else if (Array.isArray(value))
      value.forEach((v, i) => scan(v, path + "/" + i, file));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        if (keys.has(k.toLowerCase())) out.push({ file, path: path + "/" + k });
        scan(v, path + "/" + k, file);
      }
  }
  for (const file of ["youtube_cache", "youtube", "twitch", "media"])
    if (models[file]) scan(models[file], "", file);
  return out;
}
function rewire(value, from, to) {
  if (value === from) return to;
  if (Array.isArray(value)) {
    const rows = value.map((v) => rewire(v, from, to));
    return rows.every((v) => typeof v === "string") ? [...new Set(rows)] : rows;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rewire(v, from, to)]),
    );
  return value;
}
function accountTargets(models, talent) {
  const y = new Set(
      talent.accounts
        .filter((a) => a.service === "youtube")
        .map((a) => a.accountId)
        .filter(Boolean),
    ),
    t = new Set(
      talent.accounts
        .filter((a) => a.service === "twitch")
        .map((a) => a.accountId?.toLowerCase())
        .filter(Boolean),
    );
  return {
    youtube: models.youtube_streamers.filter((r) => y.has(r.youtubeChannelId)),
    twitch: models.twitch_streamers.filter((r) =>
      t.has(r.twitchUserLogin.toLowerCase()),
    ),
  };
}
export async function preview(snapshot, input, { actor } = {}) {
  if (input?.entity === "content")
    return contentPreview(snapshot, input, { actor, references });
  if (
    !input ||
    Object.keys(input).some(
      (k) =>
        ![
          "sha",
          "entity",
          "action",
          "id",
          "targetId",
          "value",
          "reason",
          "confirm",
          "confirmation",
          "collection",
        ].includes(k),
    ) ||
    !lists[input.entity] ||
    !["save", "delete", "merge", "visibility", "collection", "wiki"].includes(
      input.action,
    ) ||
    (input.reason != null && typeof input.reason !== "string") ||
    (input.reason?.length || 0) > 500
  )
    fail(400, "invalid_operation");
  const before = migration.migrateModels(snapshot.models),
    models = structuredClone(before),
    [file, list, kind] = lists[input.entity],
    rows = models[file][list];
  const old = rows.find((r) => r.id === input.id);
  models["admin-ledger"].issuedOrganizations = [
    ...new Set([
      ...(models["admin-ledger"].issuedOrganizations || []),
      ...before.talents.organizations.map((o) => o.id),
    ]),
  ];
  let target,
    id = old?.id;
  if (input.action === "save") {
    if (
      !input.value ||
      typeof input.value !== "object" ||
      (input.value.id && input.value.id !== input.id)
    )
      fail(400, "stable_id_required");
    const record = migration.withoutSources(input.value);
    if (!String(record.displayName ?? record.name ?? "").trim())
      fail(400, "name_required");
    if (
      old &&
      kind === "tal" &&
      old.affiliations.some(
        (a) =>
          !record.affiliations?.some(
            (b) => b.organizationId === a.organizationId,
          ),
      )
    )
      fail(409, "affiliation_history_must_be_retained");
    if (!old) {
      if (input.id) fail(409, "unknown_id");
      const registry =
        kind === "tal"
          ? models["talent-id-registry"].issued
          : kind === "group"
            ? models["catalog-id-registry"].issued
            : [
                ...(models["admin-ledger"].issuedOrganizations || []),
                ...models["catalog-id-registry"].issued.filter((id) =>
                  id.startsWith("org-"),
                ),
              ];
      const issued = (
        kind === "tal" ? registry.map((r) => r.id) : registry
      ).concat(rows.map((r) => r.id));
      id =
        kind +
        "-" +
        String(
          Math.max(
            0,
            ...issued
              .filter((s) => s.startsWith(kind + "-"))
              .map((s) => Number(s.split("-")[1])),
          ) + 1,
        ).padStart(6, "0");
      record.id = id;
      if (kind === "tal") {
        const channel =
          record.accounts?.find((a) => a.service === "youtube" && a.accountId)
            ?.accountId || null;
        const profileUrl =
          record.officialProfileUrl ||
          record.accounts?.find((a) => talentLib.publicUrl(a.url))?.url;
        if (profileUrl && !talentLib.publicUrl(profileUrl))
          fail(400, "invalid_identity_url");
        if (!channel && profileUrl) record.officialProfileUrl = profileUrl;
        if (
          channel &&
          models["talent-id-registry"].issued.some(
            (r) => r.youtubeChannelId === channel,
          )
        )
          fail(409, "identity_already_reserved");
        if (
          !channel &&
          profileUrl &&
          models["talent-id-registry"].issued.some(
            (r) => r.officialProfileUrl === profileUrl,
          )
        )
          fail(409, "official_profile_identity_already_registered");
        models["talent-id-registry"].issued.push({
          id,
          youtubeChannelId: channel,
          officialProfileUrl: profileUrl || null,
        });
      } else if (kind === "group")
        models["catalog-id-registry"].issued.push(id);
      else {
        models["admin-ledger"].issuedOrganizations ||= [];
        models["admin-ledger"].issuedOrganizations.push(id);
      }
      rows.push(record);
    } else rows[rows.indexOf(old)] = { ...record, id: old.id };
  } else {
    if (!old) fail(404, "entity_not_found");
    if (input.confirm !== old.id + " " + (old.displayName || old.name))
      fail(400, "confirmation_name_and_id_required");
    if (input.action === "delete") {
      const deps = references(models, id);
      const targets =
        input.entity === "talent"
          ? accountTargets(models, old)
          : { youtube: [], twitch: [] };
      if (
        deps.length ||
        targets.youtube.length ||
        targets.twitch.length ||
        (input.entity === "talent" && accountUsage(models, old).length)
      )
        fail(409, "references_prevent_deletion");
      rows.splice(rows.indexOf(old), 1);
    }
    if (input.action === "merge") {
      target = rows.find((r) => r.id === input.targetId);
      if (!target || target === old) fail(400, "merge_target_required");
      if (kind === "tal") {
        if (
          !equal(old.affiliations, target.affiliations) ||
          old.activityStatus.value !== target.activityStatus.value
        )
          fail(409, "merge_affiliations_or_activity_require_manual_resolution");
        target.accounts = [
          ...target.accounts,
          ...old.accounts.filter(
            (a) =>
              !target.accounts.some(
                (b) => b.service === a.service && b.accountId === a.accountId,
              ),
          ),
        ];
        target.aliases = [
          ...target.aliases,
          ...old.aliases.filter(
            (a) => !target.aliases.some((b) => equal(a, b)),
          ),
        ];
        if (old.displayName !== target.displayName)
          target.aliases.push({
            name: old.displayName,
            type: "alias",
            from: null,
            to: null,
          });
      }
      rows.splice(rows.indexOf(old), 1);
      for (const name of [
        "talents",
        "catalog",
        "anniversaries",
        "events",
        "music",
        "karaoke",
        "goods",
        "media",
      ])
        models[name] = rewire(models[name], id, target.id);
    }
    if (input.action === "visibility") {
      if (kind !== "tal" || !["public", "draft"].includes(input.value))
        fail(400, "invalid_visibility");
      if (input.value === "draft" && references(models, id).length)
        fail(409, "references_prevent_hiding_review_history_first");
      old.visibility = input.value;
    }
    if (input.action === "collection") {
      if (kind !== "tal" || !["include", "exclude"].includes(input.collection))
        fail(400, "invalid_collection");
      const targets = accountTargets(models, old);
      if (input.collection === "exclude") {
        models.youtube_streamers = models.youtube_streamers.filter(
          (r) => !targets.youtube.includes(r),
        );
        models.twitch_streamers = models.twitch_streamers.filter(
          (r) => !targets.twitch.includes(r),
        );
      } else
        for (const a of old.accounts) {
          if (
            a.service === "youtube" &&
            a.accountId &&
            !models.youtube_streamers.some(
              (r) => r.youtubeChannelId === a.accountId,
            )
          )
            models.youtube_streamers.push({
              name: old.displayName,
              youtubeChannelId: a.accountId,
            });
          if (
            a.service === "twitch" &&
            a.accountId &&
            !models.twitch_streamers.some(
              (r) =>
                r.twitchUserLogin.toLowerCase() === a.accountId.toLowerCase(),
            )
          )
            models.twitch_streamers.push({
              name: old.displayName,
              twitchUserLogin: a.accountId,
            });
        }
    }
    if (input.action === "wiki") {
      if (kind !== "tal" || typeof input.value !== "boolean")
        fail(400, "invalid_wiki_policy");
      models["admin-ledger"].wikiExclusions = models[
        "admin-ledger"
      ].wikiExclusions.filter((x) => x !== id);
      if (!input.value) models["admin-ledger"].wikiExclusions.push(id);
    }
  }
  const record = models[file][list].find((r) => r.id === (target?.id || id)),
    changed = record
      ? Object.keys(record).filter((k) => !equal(old?.[k], record[k]))
      : [];
  // Confirmation is bound to the exact submitted change, independently of provenance.
  if (
    !input.confirmation ||
    input.confirmation.status !== "confirmed" ||
    input.confirmation.valueHash !==
      (await hash(
        input.value ?? {
          action: input.action,
          id: input.id,
          targetId: input.targetId ?? null,
          collection: input.collection ?? null,
        },
      ))
  )
    fail(400, "field_confirmation_required");
  try {
    const previous =
      input.action === "merge" && kind === "tal"
        ? {
            talents: {
              ...before.talents,
              talents: before.talents.talents.filter((t) => t.id !== id),
            },
          }
        : before;
    validate(models, previous);
  } catch (error) {
    fail(400, "validation: " + error.message.slice(0, 600));
  }
  try { assertPrivateUnreferenced(models.talents,[models.catalog,models.anniversaries,models.events,models.music,models.karaoke,models.goods]); } catch { fail(409,"draft_has_public_references"); }
  const impact = {
    references: old ? references(before, old.id) : [],
    collection: old && kind === "tal" ? accountTargets(before, old) : null,
    publicPages:
      kind === "tal" ? ["/talents/", "/talents/" + id + "/"] : ["/talents/"],
    accountReferences: old && kind === "tal" ? accountUsage(before, old) : [],
    note: "履歴・キャッシュは削除しません。Wiki対象は管理台帳のみで、Wikiへの書込や既存Wiki同期設定は変更しません。",
  };
  const files = {},
    diff = [];
  for (const name of Object.keys(before))
    if (!equal(before[name], models[name])) {
      files[name] = models[name];
      diff.push({ file: name, before: before[name], after: models[name] });
    }
  if (
    !diff.some((d) => d.file !== "admin-ledger") &&
    !(
      input.action === "wiki" &&
      !equal(
        before["admin-ledger"].wikiExclusions,
        models["admin-ledger"].wikiExclusions,
      )
    )
  )
    fail(400, "no_changes");
  const title =
    (old?.displayName ||
      old?.name ||
      record?.displayName ||
      record?.name ||
      id) +
    " / " +
    input.action;
  const ledger = models["admin-ledger"];
  if (ledger.entries.length >= 2000) fail(409, "audit_archive_required");
  ledger.entries.push({
    id: await hash({ sha: snapshot.sha, input }),
    actor,
    entity: input.entity,
    subject: id,
    action: input.action,
    reason: input.reason?.trim() || null,
    changedFields: changed,
    at: new Date().toISOString(),
  });
  files["admin-ledger"] = ledger;
  if (!diff.some((d) => d.file === "admin-ledger"))
    diff.push({
      file: "admin-ledger",
      before: before["admin-ledger"],
      after: ledger,
    });
  return {
    migrationPending: migration.names.some(
      (name) => snapshot.models[name]?.schemaVersion !== 2,
    ),
    files,
    diff,
    title,
    impact,
    summary: `対象: ${id}\n操作: ${input.action}\n理由: ${input.reason}\n変更: ${Object.keys(files).join(", ")}\n全masterのSchema/意味的整合性を検証済み。参照影響${impact.references.length}件。`,
  };
}
