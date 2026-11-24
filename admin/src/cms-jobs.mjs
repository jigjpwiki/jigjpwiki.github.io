import { installationClient, publishingEnabled } from "./github-app.mjs";
import { googleEnabled } from "./google.mjs";
import { candidateResult, pagesIncludes, promoteCandidate, publicationPlan, selectedOperations } from "./cms-publish.mjs";
import { open, seal, hash, fail, Failure } from "./security.mjs";
import { equal } from "./submission-plan.mjs";
import { WorkspaceStore } from "./workspace.mjs";

const activeKey = "cms-publication-active";
const queueKey = "cms-publication-queue";
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
    await this.put("cms-publication:" + job.owner, job);
    await this.put(activeKey, job);
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
      const queue = await this.get(queueKey) || [];
      const active = await this.get(activeKey);
      const pending = [active, ...queue].find((job) => job?.owner === session.id && !terminal.has(job.phase));
      if (pending) {
        if (pending.fingerprint === fingerprint) return this.summary(pending);
        fail(409, "cms_publication_busy");
      }
      const last = await this.get("cms-publication:" + session.id);
      if (last?.fingerprint === fingerprint && !(retry === true && last.phase === "failed"))
        return this.summary(last);
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
      createdAt: job.createdAt } : null;
  }

  async status(owner) {
    const active = await this.get(activeKey);
    if (active?.owner === owner && !terminal.has(active.phase)) return this.summary(active);
    const queue = await this.get(queueKey) || [];
    return this.summary(queue.find((job) => job.owner === owner && job.id !== active?.id) ||
      await this.get("cms-publication:" + owner));
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
      const { plan, batchId } = await publicationPlan(snapshot, job, member);
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
    await this.report(job);
  }

  async clearAppliedDrafts(job) {
    await this.admin.atomic(async () => {
      const current = await this.workspace.get(job.owner);
      if (!current) return;
      const operations = current.operations.filter((op) =>
        !job.operations.some((selected) => selected.key === op.key && equal(selected, op)));
      if (operations.length === current.operations.length) return;
      await this.workspace.save(job.owner, {
        protocol: 1, revision: current.revision,
        operations: operations.map(({ validationState, ...op }) => op),
      });
    });
  }

  async alarm() {
    const job = await this.admin.atomic(async () => {
      const active = await this.get(activeKey);
      const queue = (await this.get(queueKey) || []).filter((item) => item.id !== active?.id);
      const next = active && !terminal.has(active.phase) ? active : queue.shift();
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
