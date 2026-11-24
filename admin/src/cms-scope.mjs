import { canEditSong } from "./cms-music.mjs";
import { fail } from "./security.mjs";
import { contentTypes } from "./content-definitions.mjs";

const types = {
  ...contentTypes,
  talent: { file: "talents", list: "talents", category: "talents" },
  group: { file: "catalog", list: "groups" },
};
const categories = new Set(["talents", ...Object.values(contentTypes).map((type) => type.category)]);

export function normalizeScope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "invalid_member_scope");
  const list = (name, allowed) => {
    const values = input[name] ?? [];
    if (!Array.isArray(values) || values.length > 100 || values.some((value) => !allowed(value)))
      fail(400, "invalid_member_scope");
    return [...new Set(values)];
  };
  return {
    organizations: list("organizations", (value) => typeof value === "string" && /^org-\d{6}$/.test(value)),
    groups: list("groups", (value) => typeof value === "string" && /^group-\d{6}$/.test(value)),
    categories: list("categories", (value) => categories.has(value)),
  };
}

const references = {
  talentId: "talent", talentIds: "talent", formerTalentIds: "talent",
  groupId: "group", groupIds: "group",
  productId: "product", campaignId: "campaign",
  songId: "song", karaokeId: "karaoke", youtubeId: "video", videoIds: "video",
};

export function cmsPermissions(models, member) {
  const scope = normalizeScope(member.scope);
  const managed = new Set(scope.organizations);
  const groups = new Set(scope.groups);
  const byType = Object.fromEntries(Object.entries(types).map(([name, type]) => [
    name,
    new Map(models[type.file][type.list].map((row) => [row[type.field || "id"], row])),
  ]));
  const memberGroups = models.catalog.groups.filter((group) => group.visibility === "public");

  function resolve(entity, row, seen) {
    if ((entity === "talent" ? row.visibility ?? "public" : row.visibility) !== "public") return { allowed: false, anchored: false };
    if (seen.has(row)) return { allowed: true, anchored: false };
    seen = new Set(seen).add(row);
    let anchored = false;
    if (entity === "talent") {
      const current = row.affiliations.filter((affiliation) => affiliation.status === "current");
      if (current.length > 1 && !current.every((affiliation) => managed.has(affiliation.organizationId)))
        return { allowed: false, anchored: false };
      anchored = current.some((affiliation) => managed.has(affiliation.organizationId)) ||
        memberGroups.some((group) => groups.has(group.id) && group.talentIds.includes(row.id));
      return { allowed: anchored, anchored };
    }
    if (entity === "group" && groups.has(row.id)) anchored = true;
    if (entity === "video") {
      const owners = [...byType.talent.values()].filter((person) => person.accounts.some(
        (account) => account.service === "youtube" && account.accountId === row.channelId,
      ));
      if (owners.length !== 1) return { allowed: false, anchored: false };
      return resolve("talent", owners[0], seen);
    }

    function visit(value) {
      if (!value || typeof value !== "object") return true;
      return Object.entries(value).every(([key, item]) => {
        if (item === null) return true;
        if (["organizationId", "organizationIds", "organizerIds", "relatedOrganizationIds"].includes(key)) {
          const ids = Array.isArray(item) ? item : [item];
          if (ids.length) anchored = true;
          return ids.every((id) => managed.has(id) || (
            entity === "group" && groups.has(row.id) && row.organizationId === id
          ));
        }
        const target = references[key];
        if (!target || (entity === "video" && key === "youtubeId")) return visit(item);
        return (Array.isArray(item) ? item : [item]).every((id) => {
          const related = byType[target].get(id);
          if (!related) return false;
          const result = resolve(target, related, seen);
          anchored ||= result.anchored;
          return result.allowed;
        });
      });
    }

    if (entity === "campaign") {
      const offers = models.goods.offers.filter((offer) => offer.campaignId === row.id);
      if (!offers.length) return { allowed: false, anchored: false };
      for (const offer of offers) {
        const product = byType.product.get(offer.productId);
        if (!product || offer.visibility !== "public") return { allowed: false, anchored: false };
        const result = resolve("product", product, seen);
        if (!result.allowed) return { allowed: false, anchored: false };
        anchored ||= result.anchored;
      }
    }
    const allowed = visit(row);
    return { allowed, anchored };
  }

  function canRead(entity, row) {
    if (!row || !scope.categories.includes(types[entity]?.category)) return false;
    if (entity === "song") return row.visibility === "public" && canEditSong(models, { canRead }, row.id);
    const result = resolve(entity, row, new Set());
    return result.allowed && result.anchored;
  }

  function assertChange(entity, before, after, { publish = false } = {}) {
    if (member.role !== "editor" || (publish && member.directPublish !== true) ||
        !after || (before && !canRead(entity, before)) || !canRead(entity, after))
      fail(403, "cms_scope_denied");
    if (entity === "talent") {
      if (!before && (after.affiliations.length !== 1 ||
          after.affiliations[0].status !== "current" ||
          !managed.has(after.affiliations[0].organizationId)))
        fail(403, "cms_scope_denied");
      if (before && JSON.stringify(before.affiliations) !== JSON.stringify(after.affiliations)) {
        const current = (record) => record.affiliations.filter((row) => row.status === "current");
        const old = current(before), next = current(after);
        if (old.length !== 1 || next.length !== 1 ||
            ![...old, ...next].every((row) => managed.has(row.organizationId)))
          fail(403, "cms_scope_denied");
      }
      if (before) {
        for (const type of ["group", "event", "product", "anniversary", "musicVideo", "karaoke", "performance"]) {
          for (const row of byType[type].values()) {
            const refersToTalent = row.talentIds?.includes(before.id) ||
              (type === "event" && row.slots?.some((slot) => slot.talentIds?.includes(before.id)));
            if (row.visibility === "public" && refersToTalent &&
                !resolve(type, row, new Set()).allowed)
              fail(403, "cms_scope_denied");
          }
        }
      }
    }
  }

  return { canRead, assertChange };
}

export function scopedCatalog(models, member) {
  const permissions = cmsPermissions(models, member);
  return ["talent", "anniversary", "event", "song", "musicVideo", "karaoke", "product", "campaign"].map((entity) => {
    const type = types[entity];
    return {
      category: type.category,
      entity,
      label: type.label || "VTuber",
      items: models[type.file][type.list].filter((row) => permissions.canRead(entity, row)).map((row) => ({
        id: row.id,
        title: row.displayName || row.title || row.rawSongTitle || byTypeVideoTitle(models, row),
        description: typeof row.description === "string" ? row.description : "",
      })),
    };
  }).filter(({ category }) => member.scope?.categories.includes(category));
}

// The new offer itself must not establish the editor's right to attach it.
export function assertExistingCampaign(models, permissions, id) {
  if (id == null || (typeof id === "string" && id.startsWith("@"))) return;
  const campaign = models.goods.campaigns.find((row) => row.id === id);
  if (!permissions.canRead("campaign", campaign)) fail(403, "cms_scope_denied");
}

function byTypeVideoTitle(models, row) {
  return row.youtubeId && models.media.videos.find((video) => video.youtubeId === row.youtubeId)?.title;
}
