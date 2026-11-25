import { publicationPlan, selectedOperations } from "./cms-publish.mjs";
import { fail, hash, open, seal } from "./security.mjs";

const lifetime = 10 * 60_000;

export async function publicationReview(snapshot, workspace, member, owner, input, key, lookup) {
  if (!workspace || workspace.revision !== input?.revision) fail(409, "workspace_revision_conflict");
  const operations = selectedOperations(workspace, input.draftIds);
  const id = await hash({ owner, sha: snapshot.sha, operations });
  const { plan } = await publicationPlan(snapshot, {
    id, owner, operations, createdAt: new Date().toISOString(),
  }, member, lookup);
  const records = plan.impact.records.map((row) => ({
    entity: row.entity, id: row.id, action: row.action,
    name: row.value?.displayName || row.value?.title || row.value?.name || row.id,
    changes: row.fields.map((field) => ({
      field, before: row.before?.[field] ?? null, after: row.value?.[field] ?? null,
    })),
  }));
  const result = { sha: snapshot.sha, records, publicPages: plan.impact.publicPages || [] };
  if (JSON.stringify(result).length > 120000) fail(413, "cms_review_size_limit");
  return {
    ...result,
    review: await seal({
      owner, sha: snapshot.sha, revision: workspace.revision,
      fingerprint: await hash(operations), expires: Date.now() + lifetime,
    }, key),
  };
}

export async function assertPublicationReview(token, snapshot, workspace, owner, operations, key) {
  if (typeof token !== "string" || token.length > 2000) fail(409, "cms_review_required");
  let review;
  try { review = await open(token, key); }
  catch { fail(409, "cms_review_required"); }
  if (review.owner !== owner || review.revision !== workspace.revision ||
      review.sha !== snapshot.sha || !Number.isFinite(review.expires) || review.expires <= Date.now() ||
      review.fingerprint !== await hash(operations))
    fail(409, "cms_review_stale");
}
