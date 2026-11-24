import { collectedVideo, assertSongEdit } from "./cms-music.mjs";
import { entities, planSubmission, recordAt } from "./submission-plan.mjs";
import { cmsPermissions, assertExistingCampaign } from "./cms-scope.mjs";
import { repository } from "./github.mjs";
import { fail, hash } from "./security.mjs";
import { draftGroups } from "./cms-draft.mjs";

const api = "/repos/" + repository;
const validSha = (sha) => typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha);

export function selectedOperations(workspace, ids) {
  const groups = draftGroups(workspace?.operations);
  if (!Array.isArray(ids) || !ids.length || ids.length > 12 ||
      new Set(ids).size !== ids.length || ids.some((id) => !groups.has(id)))
    fail(400, "cms_invalid_publication_selection");
  return ids.flatMap((id) => groups.get(id));
}

export async function publicationPlan(snapshot, job, member) {
  if (member.role !== "editor" || member.directPublish !== true) fail(403, "cms_scope_denied");
  const batchId = await hash({ id: job.id, base: snapshot.sha });
  const before = cmsPermissions(snapshot.models, member);
  for (const op of job.operations) {
    if (!["event", "product", "offer", "anniversary", "campaign", "talent", "musicVideo", "video", "song", "karaoke", "performance"].includes(op.entity) ||
        (op.id && !before.canRead(op.entity, recordAt(snapshot.models, op))))
      fail(403, "cms_scope_denied");
    if (["musicVideo", "karaoke"].includes(op.entity)) {
      const pending = job.operations.find((row) => row.entity === "video" && !row.id &&
        row.value.youtubeId === op.value.youtubeId);
      const value = { ...op.value, ...(op.value.songId?.startsWith("@") ? { songId: null } : {}) };
      if (pending) {
        if (!before.canRead("video", pending.value) ||
            !before.canRead(op.entity, { ...value, youtubeId: null }))
          fail(403, "cms_scope_denied");
      } else if (!before.canRead(op.entity, value)) fail(403, "cms_scope_denied");
    }
    if (op.entity === "video" && (op.id ||
        collectedVideo(snapshot.models, op.value.youtubeId).channelId !== op.value.channelId ||
        !before.canRead("video", op.value)))
      fail(403, "cms_scope_denied");
    if (op.entity === "song" && op.id) assertSongEdit(snapshot.models, before, op.id);
    if (op.entity === "talent" && op.id) {
      const current = recordAt(snapshot.models, op);
      before.assertChange("talent", current, current);
    }
    if (op.entity === "product" && op.id) {
      const offers = snapshot.models.goods.offers.filter((offer) => offer.productId === op.id);
      if (offers.some((offer) => !before.canRead("offer", offer)))
        fail(403, "cms_shared_goods");
    }
    if (op.entity === "offer") assertExistingCampaign(snapshot.models, before, op.value.campaignId);
    if (op.entity === "offer" && op.id) {
      const old = recordAt(snapshot.models, op);
      if (old.campaignId !== op.value.campaignId || old.productId !== op.value.productId)
        fail(403, "cms_shared_goods");
    }
  }
  // Preserve the numeric audit format with a namespaced opaque internal identifier.
  const uuid = job.owner.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/.test(uuid)) fail(403, "cms_actor_invalid");
  const actor = "900" + BigInt("0x" + uuid).toString().padStart(39, "0");
  const plan = await planSubmission(snapshot, job.operations.map(({ validationState, ...op }) => op), {
    actor, batchId, at: job.createdAt,
  });
  if (plan.conflicts?.length) fail(409, "cms_publish_conflict");
  const after = cmsPermissions({ ...snapshot.models, ...plan.files }, member);
  for (const row of plan.impact.records) {
    if (!entities[row.entity] || !["event", "product", "offer", "anniversary", "campaign", "talent", "musicVideo", "video", "song", "karaoke", "performance"].includes(row.entity)) fail(403, "cms_scope_denied");
    if (row.entity === "song") assertSongEdit({ ...snapshot.models, ...plan.files }, after, row.id);
    else after.assertChange(row.entity, row.before, row.value, { publish: true });
  }
  return { plan: { ...plan, sha: snapshot.sha, tree: snapshot.tree }, batchId };
}

export async function candidateResult(github, branch, sha) {
  const { workflow_runs } = await github.call(api + "/actions/workflows/update-streams.yml/runs?" +
    new URLSearchParams({ branch, head_sha: sha, event: "push", per_page: "10" }));
  const run = workflow_runs.find((row) => row.head_sha === sha && row.head_branch === branch && row.event === "push");
  if (!run || run.status !== "completed") return "pending";
  return run.conclusion === "success" ? "success" : "failed";
}

export async function promoteCandidate(github, job, requireGrant, savePromotionIntent) {
  const { object } = await github.call(api + "/git/ref/heads/main");
  if (object.sha === job.commit && job.phase === "promoting") return "applied";
  if (job.phase === "promoting" && validSha(object.sha)) {
    const comparison = await github.call(api + "/compare/" + job.commit + "..." + object.sha);
    if (comparison.status === "ahead" && comparison.merge_base_commit?.sha === job.commit) return "applied";
  }
  if (object.sha !== job.base) return "rebase";
  const candidate = await github.call(api + "/git/commits/" + job.commit);
  if (candidate.parents?.length !== 1 || candidate.parents[0].sha !== job.base)
    fail(409, "cms_candidate_parent_changed");
  await requireGrant();
  await savePromotionIntent();
  await github.call(api + "/git/refs/heads/main", "PATCH", { sha: job.commit, force: false });
  return "applied";
}

export async function pagesIncludes(github, sha, transport) {
  const response = await transport("https://www.jigdule.jp/published-commit.txt", {
    signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
  });
  if (!response.ok) return false;
  const deployed = (await response.text()).trim();
  if (!validSha(deployed)) return false;
  if (deployed === sha) return true;
  const comparison = await github.call(api + "/compare/" + sha + "..." + deployed);
  return comparison.status === "ahead" && comparison.merge_base_commit?.sha === sha;
}
