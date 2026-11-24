import { installationClient, publishingEnabled } from "./github-app.mjs";
import { GitHub, repository } from "./github.mjs";
import { youtubeVideoLookup } from "./cms-music.mjs";
import { googleEnabled } from "./google.mjs";
import { candidateResult, pagesIncludes, promoteCandidate, publicationPlan, selectedOperations } from "./cms-publish.mjs";
import { open, seal, hash, fail, Failure } from "./security.mjs";
import { equal } from "./submission-plan.mjs";
import { WorkspaceStore } from "./workspace.mjs";
import { draftGroups } from "./cms-draft.mjs";

const activeKey = "cms-publication-active";
const queueKey = "cms-publication-queue";
const replayKey = (owner) => "cms-publication-replay:" + owner;
const interval = 60_000;
const lifetime = 86400_000;
const terminal = new Set(["published", "failed", "unconfirmed"]);

export class CmsJobs {
  constructor(admin) {
    Object.assign(this, { admin, store: admin.store, env: admin.env });
    this.workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
  }

  async put(key, job) {
    await this.store.put(key, await seal(job, this.env.SESSION_KEY), Date.now() + 30 * lifetime);
  }

  async get(key) {
    const encoded = await this.store.get(key);
    return encoded ? open(encoded, this.env.SESSION_KEY) : null;
  }

  async report(job) {
    // The active journal is authoritative until the owner index is durable.
    await this.put(activeKey, job);
    await this.put("cms-publication:" + job.owner, job);
  }

  async requireGrant(job) {
    if (this.env.ADMIN_ENABLED !== "true" || !googleEnabled(this.env) || !publishingEnabled(this.env))
      fail(403, "cms_publish_disabled");
    const entry = await this.store.get(job.memberKey);
    const member = entry && await open(entry, this.env.SESSION_KEY);
    if (!member || member.disabled || member.id !== job.owner || member.revision !== job.grant ||
        member.role !== "editor" || member.directPublish !== true) fail(403, "cms_scope_denied");
    return member;
  }

  async enqueue(session, input) {
    return this.admin.atomic(async () => {
      const workspace = await this.workspace.get(session.id);
      const ids = input?.draftIds;
      const retry = input?.retry;
      const operations = selectedOperations(workspace, ids);
      if (workspace.revision !== input.revision) fail(409, "workspace_revision_conflict");
      const fingerprint = await hash({ owner: session.id, operations });
      const active = await this.get(activeKey);
      const queue = (await this.get(queueKey) || []).filter((job) => job.id !== active?.id);
      const pending = [active, ...queue].find((job) => job?.owner === session.id && !terminal.has(job.phase));
      if (pending) {
        if (pending.fingerprint === fingerprint) return this.summary(pending);
        fail(409, "cms_publication_busy");
      }
      const last = active?.owner === session.id ? active : await this.get("cms-publication:" + session.id);
      if (last?.fingerprint === fingerprint && !(retry === true && last.phase === "failed"))
        return this.summary(last);
      // Changing the selection cannot make an uncertain promotion safe to repeat.
      if (last?.phase === "unconfirmed") fail(409, "cms_publication_unconfirmed");
      const guards = await this.get(replayKey(session.id));
      const priorCreates = last?.phase === "published"
        ? draftGroups(last.operations).entries() : [];
      const applied = new Set([
        ...(guards?.workspaceId === workspace.workspaceId ? guards.draftIds : []),
        ...Array.from(priorCreates, ([id, rows]) => rows.some((row) => !row.id) ? id : null),
      ]);
      if (ids.some((id) => applied.has(id))) fail(409, "cms_draft_already_applied");
      if (queue.length >= 8) fail(409, "cms_publication_busy");
      const createdAt = new Date().toISOString();
      const id = await hash([fingerprint, createdAt]);
      const job = {
        id, fingerprint, owner: session.id, memberKey: session.memberKey, grant: session.revision,
        operations, createdAt, phase: "queued",
      };
      await this.requireGrant(job);
      await this.admin.state.storage.setAlarm(Date.now() + 1000);
      await this.put(queueKey, [...queue, job]);
      return this.summary(job);
    });
  }

  summary(job) {
    return job ? { id: job.id, phase: job.phase, commit: job.commit ?? null, error: job.error ?? null,
      createdAt: job.createdAt, mainConfirmed: job.mainConfirmed === true,
      ...((job.mainConfirmed || job.phase === "published") && job.createdRecords?.length
        ? { createdRecords: job.createdRecords } : {}) } : null;
  }

  async status(owner) {
    const active = await this.get(activeKey);
    if (active?.owner === owner && !terminal.has(active.phase)) return this.summary(active);
    const queue = await this.get(queueKey) || [];
    return this.summary(queue.find((job) => job.owner === owner && job.id !== active?.id) ||
      (active?.owner === owner ? active : await this.get("cms-publication:" + owner)));
  }

  async reconcile(session, id) {
    if (typeof id !== "string" || !id) fail(404, "cms_publication_missing");
    const owner = session.id;
    const ownerKey = "cms-publication:" + owner;
    const cooldownKey = "cms-publication-reconcile:" + owner;
    const getJob = async () => {
      const active = await this.get(activeKey);
      if (active?.id === id && active.owner === owner) return active;
      const indexed = await this.get(ownerKey);
      return indexed?.id === id && indexed.owner === owner ? indexed : null;
    };
    const job = await this.admin.atomic(async () => {
      const current = await getJob();
      if (!current) fail(404, "cms_publication_missing");
      if (current.phase !== "unconfirmed" || !/^[0-9a-f]{40}$/.test(current.commit ?? "")) return current;
      if (await this.store.get(cooldownKey)) fail(429, "cms_publication_reconcile_wait");
      await this.store.put(cooldownKey, "1", Date.now() + 15_000);
      return current;
    });
    if (job.phase !== "unconfirmed" || !/^[0-9a-f]{40}$/.test(job.commit ?? "")) return this.summary(job);

    // Reconciliation uses public repository reads and also works when publishing is disabled.
    const github = new GitHub("", (url, options) => {
      const headers = new Headers(options.headers);
      headers.delete("Authorization");
      return this.admin.transport(url, { ...options, headers });
    });
    const api = "/repos/" + repository;
    const head = (await github.call(api + "/git/ref/heads/main")).object?.sha;
    if (!/^[0-9a-f]{40}$/.test(head ?? "")) return this.summary(job);
    if (head !== job.commit) {
      const comparison = await github.call(api + "/compare/" + job.commit + "..." + head);
      if (comparison.status !== "ahead" || comparison.merge_base_commit?.sha !== job.commit) return this.summary(job);
    }
    const deployed = await pagesIncludes(github, job.commit, this.admin.transport).catch(() => false);
    return this.admin.atomic(async () => {
      const current = await getJob();
      if (current?.phase !== "unconfirmed" || current.commit !== job.commit) return this.summary(current);
      await this.clearAppliedDraftsLocked(current);
      current.mainConfirmed = true;
      if (deployed) {
        current.phase = "published";
        delete current.error;
      }
      const active = await this.get(activeKey);
      if (active?.id === current.id) await this.report(current);
      else await this.put(ownerKey, current);
      return this.summary(current);
    });
  }

  async step(job, github) {
    if (job.phase === "pages") {
      await this.clearAppliedDrafts(job);
      if (await pagesIncludes(github, job.commit, this.admin.transport)) job.phase = "published";
      return;
    }

    if (job.phase === "queued" || job.phase === "candidate") {
      const member = await this.requireGrant(job);
      const snapshot = await github.snapshot();
      if (job.base !== snapshot.sha) {
        job.base = snapshot.sha;
        delete job.commit;
      }
      const { plan, batchId } = await publicationPlan(snapshot, job, member, youtubeVideoLookup(this.env.YOUTUBE_API_KEY, this.admin.transport));
      // The validated plan identifies newly allocated fixed IDs. Keep only
      // the correspondence, and disclose it after observing the commit on main.
      job.createdRecords = plan.impact.records.filter((row) => row.action === "create")
        .map(({ key, entity, id }) => ({ key, entity, id }));
      job.phase = "candidate";
      job.branch = "cms/candidate-" + batchId;
      await this.report(job);
      await github.publish(plan, batchId, job, (value) => this.report(value), { candidateOnly: true });
      job.phase = "checking";
      return;
    }

    // A lost PATCH response leaves a persisted promotion intent. Recover it
    // before considering a replacement candidate or changing any draft.
    if (job.phase === "checking") {
      await this.requireGrant(job);
      const result = await candidateResult(github, job.branch, job.commit);
      if (result === "pending") return;
      if (result !== "success") fail(409, "cms_candidate_ci_failed");
    }

    const apply = await this.admin.atomic(async () => {
      return promoteCandidate(github, job, () => this.requireGrant(job), async () => {
        job.phase = "promoting";
        await this.report(job);
      });
    });
    if (apply === "rebase") {
      job.phase = "queued";
      delete job.commit;
      delete job.base;
      return;
    }

    job.phase = "pages";
    job.mainConfirmed = true;
    await this.report(job);
  }

  async clearAppliedDrafts(job) {
    await this.admin.atomic(() => this.clearAppliedDraftsLocked(job));
  }

  async clearAppliedDraftsLocked(job) {
    const current = await this.workspace.get(job.owner);
    if (!current) return;
    const currentGroups = draftGroups(current.operations);
    const remove = new Set();
    const guards = await this.get(replayKey(job.owner));
    const blocked = new Set(guards?.workspaceId === current.workspaceId
      ? guards.draftIds.filter((id) => currentGroups.has(id)) : []);
    for (const [id, selected] of draftGroups(job.operations)) {
      const group = currentGroups.get(id);
      // In-flight edits can introduce or change sibling operations. Preserve
      // the complete group rather than leaving unresolved temporary IDs.
      if (group?.length === selected.length &&
          selected.every((operation) => group.some((row) => equal(row, operation)))) {
        for (const operation of group) remove.add(operation.key);
      } else if (group && selected.some((row) => !row.id)) {
        // This draft still carries temporary identities already materialized
        // by the published commit. Retain it, but never allocate them again.
        blocked.add(id);
      }
    }
    if (blocked.size) {
      // Workspace expiry extends on every save. Bind guards to its immutable
      // ID and retain them across later publications and idle intervals.
      await this.store.put(replayKey(job.owner), await seal({
        workspaceId: current.workspaceId, draftIds: [...blocked],
      }, this.env.SESSION_KEY), Number.MAX_SAFE_INTEGER);
    }
    const operations = current.operations.filter((op) => !remove.has(op.key));
    if (operations.length === current.operations.length) return;
    await this.workspace.save(job.owner, {
      protocol: 1, revision: current.revision,
      operations: operations.map(({ validationState, ...op }) => op),
    });
  }

  async alarm() {
    const job = await this.admin.atomic(async () => {
      const active = await this.get(activeKey);
      const queue = (await this.get(queueKey) || []).filter((item) => item.id !== active?.id);
      const next = active && !terminal.has(active.phase) ? active : queue.shift();
      // Repair a terminal owner index before handing the active slot to the
      // next job; both the report and this replay are safe to repeat.
      if (active && terminal.has(active.phase))
        await this.put("cms-publication:" + active.owner, active);
      if (!next) return null;
      await this.admin.state.storage.setAlarm(Date.now() + interval);
      // Persist the handoff before removing the queue entry. A repeated alarm
      // recognizes an already promoted queue entry by job ID.
      if (next.id !== active?.id) await this.report(next);
      await this.put(queueKey, queue);
      return next;
    });
    if (!job) return;
    try {
      if (Date.now() - Date.parse(job.createdAt) > lifetime) {
        if (job.phase === "pages") await this.clearAppliedDrafts(job);
        const uncertain = job.phase === "pages" || job.phase === "promoting";
        job.phase = uncertain ? "unconfirmed" : "failed";
        job.error = uncertain ? "cms_publication_unconfirmed" : "cms_publication_timeout";
      } else {
        const github = await installationClient(this.env, this.admin.transport);
        await this.step(job, github);
        job.error = null;
      }
    } catch (error) {
      job.error = error instanceof Failure ? error.message : "cms_publish_unavailable";
      if (error instanceof Failure && error.status < 500 && error.status !== 429) {
        if (job.phase === "promoting" && error.message === "github_422") {
          job.phase = "checking";
        } else {
          job.phase = job.phase === "promoting" || job.phase === "pages" ? "unconfirmed" : "failed";
        }
      }
    }
    await this.report(job);
  }
}
