import { cmsPermissions } from "./cms-scope.mjs";
import { equal, recordAt, threeWay } from "./submission-plan.mjs";
import { fail } from "./security.mjs";
import validateAudit from "./audit.cjs";

const tracked = new Set(["talent", "anniversary", "song", "musicVideo", "video",
  "karaoke", "performance", "event", "campaign", "product", "offer"]);

export function scopedHistory(snapshot, member, audit, batchId) {
  validateAudit(audit, batchId);
  const access = cmsPermissions(snapshot.models, member);
  const operations = audit.operations.filter((row) => {
    if (member.owner === true) return true;
    if (!tracked.has(row.entity)) return false;
    const current = recordAt(snapshot.models, { ...row, id: row.recordId });
    return access.canRead(row.entity, current) &&
      (!row.before || access.canRead(row.entity, row.before)) &&
      (!row.after || access.canRead(row.entity, row.after));
  });
  return { batchId, actor: audit.actor, createdAt: audit.createdAt, operations };
}

export function prepareAuditReversal(snapshot, member, audit, batchId, operationId, recordId) {
  if (member.role !== "editor") fail(403, "cms_scope_denied");
  const { operations } = scopedHistory(snapshot, member, audit, batchId);
  const matches = operations.filter((row) => row.operationId === operationId && row.recordId === recordId);
  if (matches.length !== 1) fail(403, "cms_scope_denied");
  const [row] = matches;
  if (!tracked.has(row.entity) || row.action !== "edit" || !row.before || !row.after ||
      row.before.visibility !== row.after.visibility)
    fail(409, "cms_history_reversal_unavailable");
  const change = { entity: row.entity, id: row.recordId };
  const current = recordAt(snapshot.models, change);
  const access = cmsPermissions(snapshot.models, member);
  if (!access.canRead(row.entity, current)) fail(403, "cms_scope_denied");
  const merged = threeWay(row.after, row.before, current);
  if (merged.conflicts.length) fail(409, "cms_history_reversal_conflict");
  if (equal(current, merged.value)) fail(409, "no_changes");
  access.assertChange(row.entity, current, merged.value);
  return { ...change, key: "cms-" + row.entity.toLowerCase(), before: current,
    value: merged.value, baseCommit: snapshot.sha };
}

const auditPath = /^ops\/admin\/audit\/([\w-]{43})\.json$/;
const shaPattern = /^[a-f0-9]{40}$/;
const pageSize = 8;

export async function readCmsHistory({ snapshot, member, github, transport, repository, batchId, offset = 0 }) {
  if (!shaPattern.test(snapshot.sha) || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    fail(400, "cms_history_invalid");
  const read = async (url) => {
    try {
      const response = await transport(url, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "jigwiki-admin" },
      });
      if (!response.ok) fail(503, "cms_history_unavailable");
      return await response.json();
    } catch {
      fail(503, "cms_history_unavailable");
    }
  };
  async function entry(id) {
    if (!/^[\w-]{43}$/.test(id)) fail(400, "cms_history_invalid");
    const audit = await read("https://raw.githubusercontent.com/" + repository + "/" +
      snapshot.sha + "/ops/admin/audit/" + id + ".json");
    const summary = scopedHistory(snapshot, member, audit, id);
    return { audit, summary };
  }
  if (batchId !== null && batchId !== undefined) return entry(batchId);
  const path = "/repos/" + repository + "/git/trees/" + snapshot.sha + "?recursive=1";
  const listing = github ? await github.call(path) : await read("https://api.github.com" + path);
  if (listing.truncated || !Array.isArray(listing.tree)) fail(503, "cms_history_unavailable");
  const ids = listing.tree.flatMap((row) => {
    const match = row.type === "blob" && auditPath.exec(row.path);
    return match ? [match[1]] : [];
  }).sort();
  const entries = await Promise.all(ids.slice(offset, offset + pageSize).map(entry));
  return {
    records: entries.map(({ summary }) => summary).filter(({ operations }) => operations.length)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ batchId: id, actor, createdAt, operations }) => ({ batchId: id, actor, createdAt, count: operations.length })),
    next: ids.length > offset + pageSize ? offset + pageSize : null,
  };
}
