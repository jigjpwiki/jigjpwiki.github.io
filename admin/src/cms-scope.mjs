import { canEditSong } from "./cms-music.mjs";
import { fail } from "./security.mjs";
import { contentTypes } from "./content-definitions.mjs";
import goodsCore from "../../assets/js/goods-core.js";
import memberOrder from "../../assets/js/member-order.js";

const types = {
  ...contentTypes,
  talent: { file: "talents", list: "talents", category: "talents" },
  group: { file: "catalog", list: "groups", category: "organizations", label: "グループ" },
  organization: { file: "talents", list: "organizations", category: "organizations", label: "事務所" },
};
const categories = new Set(["talents", "organizations", ...Object.values(contentTypes).map((type) => type.category)]);

export const allContentPolicy = "all-content-v1";
export function hasAllContent(member) {
  return member?.contentPolicy === allContentPolicy;
}

export function normalizeMemberPolicy(input, previous) {
  const policy = input.contentPolicy ?? previous?.contentPolicy ?? (previous ? "scoped-v1" : allContentPolicy);
  if (!["scoped-v1", allContentPolicy].includes(policy)) fail(400, "invalid_content_policy");
  if (previous && !hasAllContent(previous) && policy === allContentPolicy &&
      input.confirmPolicyMigration !== true) fail(409, "content_policy_confirmation_required");
  return policy;
}

export function contentCategories(member) {
  return hasAllContent(member) ? [...categories] : normalizeScope(member.scope).categories;
}

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
    if (!row || !types[entity]) return false;
    if (hasAllContent(member)) return true;
    if (!scope.categories.includes(types[entity]?.category)) return false;
    if (member.owner === true) return (row.visibility ?? "public") === "public";
    if (entity === "song") return row.visibility === "public" && canEditSong(models, { canRead }, row.id);
    const result = resolve(entity, row, new Set());
    return result.allowed && result.anchored;
  }

  function assertChange(entity, before, after, { publish = false } = {}) {
    if (member.role !== "editor" || (publish && member.directPublish !== true) ||
        !after || (before && !canRead(entity, before)) || !canRead(entity, after))
      fail(403, "cms_scope_denied");
    if (member.owner === true || hasAllContent(member)) return;
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

  return { canRead, assertChange, allContent: hasAllContent(member) };
}

export function scopedCatalog(models, member) {
  const permissions = cmsPermissions(models, member);
  const allowed = new Set(contentCategories(member));
  const all = hasAllContent(member);
  const orgNames = new Map(models.talents.organizations
    .filter((row) => all || member.scope?.organizations?.includes(row.id))
    .map((row) => [row.id, row.name]));
  const ordered=memberOrder.orderedPeople(models.talents,models.anniversaries?.events);
  const people = new Map(ordered.map((row) => [row.id, row.displayName]));
  const products = new Map(models.goods.products.map((row) => [row.id, row.title]));
  const videos = new Map(models.media.videos.map((row) => [row.youtubeId, row.title]));
  const groupNames = new Map();
  if (all) for (const group of models.catalog.groups) {
    for (const id of group.talentIds || []) {
      if (!groupNames.has(id)) groupNames.set(id, []);
      groupNames.get(id).push(group.name);
    }
  }
  const compact = (values) => {
    const names = [...new Set(values.filter(Boolean))];
    return names.slice(0, 3).join("、") + (names.length > 3 ? " 他" + (names.length - 3) + "件" : "");
  };
  const price = (row) => row.price?.amount == null ? "" : row.price.amount + " " + (row.price.currency || "");
  const metadata = (entity, row) => {
    const persons = all ? compact(memberOrder.sortIds(row.talentIds||[],ordered).map((id) => people.get(id))) : "";
    switch (entity) {
      case "talent": return { context: compact([...(row.affiliations || []).filter((a) => a.status === "current").map((a) => orgNames.get(a.organizationId)), ...(groupNames.get(row.id) || [])]) };
      case "group": return { context: orgNames.get(row.organizationId) || "" };
      case "anniversary": return { context: persons, date: row.date?.month && row.date?.day ? (row.date.year ? row.date.year + "/" : "") + row.date.month + "/" + row.date.day : "" };
      case "event": return { context: compact([...(row.organizerIds || []).map((id) => orgNames.get(id)), ...(row.relatedOrganizationIds || []).map((id) => orgNames.get(id)), row.venue]), date: row.starts?.value || "" };
      case "song": return { context: compact(row.originalArtists || []) };
      case "musicVideo": case "karaoke": case "performance": return { context: persons, date: row.registeredAt || "" };
      case "video": return { date: row.publishedAt || "" };
      case "product": return { context: persons };
      case "offer": return { context: price(row), date: row.endsAt || row.startsAt || "" };
      default: return {};
    }
  };
  return ["organization", "group", "talent", "anniversary", "event", "song", "musicVideo", "karaoke", "performance", "video", "product", "campaign", "offer"].filter((entity) => allowed.has(types[entity].category)).map((entity) => {
    const type = types[entity];
    return {
      category: type.category,
      entity,
      label: type.label || "VTuber",
      items: (entity==='talent'?ordered:models[type.file][type.list]).filter((row) => permissions.canRead(entity, row)).map((row) => ({
        id: row[type.field || "id"],
        title: row.displayName || row.name || row.title || row.rawSongTitle || row.rawLabel ||
          (entity === "offer" ? products.get(row.productId) : null) ||
          videos.get(row.youtubeId) || row[type.field || "id"],
        description: typeof row.description === "string" ? row.description : "",
        ...metadata(entity, row),
        visibility: row.visibility ?? "public",
        state: row.activityStatus?.value || row.status || row.timing || row.verification || row.setlistStatus || row.availability || "",
        ...(entity === "talent" ? { image: row.profileImage?.url || "" } : {}),
        ...(entity === "product" ? { image: typeof row.image === "string" ? row.image : row.image?.url || "" } : {}),
        ...(entity === "event" ? { image: row.thumbnailUrl || "" } : {}),
      })),
    };
  });
}

// The new offer itself must not establish the editor's right to attach it.
export function assertExistingCampaign(models, permissions, id) {
  if (id == null || (typeof id === "string" && id.startsWith("@"))) return;
  const campaign = models.goods.campaigns.find((row) => row.id === id);
  if (!permissions.canRead("campaign", campaign)) fail(403, "cms_scope_denied");
}


/** Presentation projection only: never invent campaign membership, change IDs,
 * or expose products/offers outside the caller's existing catalog permission. */
export function scopedGoodsEntries(models, member, sections = scopedCatalog(models, member)) {
  const by = entity => new Map((sections.find(row => row.entity === entity)?.items || []).map(row => [row.id,row]));
  const products = by("product"), campaigns = by("campaign"), offers = by("offer");
  const saleRows = models.goods.offers.filter(row => offers.has(row.id) && products.has(row.productId));
  const names = new Map(models.talents.talents.map(row=>[row.id,row.displayName]));
  const groups = new Map(models.catalog.groups.map(row=>[row.id,row.name]));
  const records = new Map(models.goods.products.map(row=>[row.id,row]));
  const rows = [];
  const create = (entity,item,items,sales,image) => {
    const ordered=memberOrder.orderedPeople(models.talents,models.anniversaries?.events);
    const subject = [...new Set([...memberOrder.sortIds([...new Set(items.flatMap(p=>p.talentIds))],ordered).map(id=>names.get(id)),...items.flatMap(p=>p.groupIds.map(id=>groups.get(id)))].filter(Boolean))];
    return {...item,entity,image:image||"",context:[items.length+"商品",...subject.slice(0,3)].join(" · "),
      description: [...items.map(p=>p.title),...subject].join(" "),
      date: sales.map(o=>o.startsAt).filter(Boolean).sort().at(-1)||"",
      state: goodsCore.productAggregate(sales).code,
      sales: sales.map(({productId,startsAt,endsAt,status,saleMode})=>({productId,startsAt,endsAt,status,saleMode})),
      saleMode: goodsCore.modeLabel(sales), productCount:items.length};
  };
  for (const c of models.goods.campaigns) if(campaigns.has(c.id)){
    const sales=saleRows.filter(o=>o.campaignId===c.id);
    const items=[...new Set(sales.map(o=>o.productId))].map(id=>records.get(id)).filter(Boolean);
    rows.push(create("campaign",campaigns.get(c.id),items,sales,c.image));
  }
  for(const [id,p] of products){
    const allSales=models.goods.offers.filter(o=>o.productId===id);
    // Scoped legacy members can still reach an allowed product when its
    // shared campaign is not in scope, without revealing the campaign.
    const standalone=saleRows.filter(o=>o.productId===id&&(!o.campaignId||!campaigns.has(o.campaignId)));
    if(!allSales.length||standalone.length) rows.push(create("product",p,[records.get(id)],standalone,p.image));
  }
  return rows;
}
