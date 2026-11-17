import { WorkspaceStore } from "./workspace.mjs";
import {
  planSubmission,
  recordAt,
  equal,
  entities,
  dependencies,
} from "./submission-plan.mjs";
import { repository, filePath, files, prDescription } from "./github.mjs";
import { fail, hash, seal, open } from "./security.mjs";
const days = 180 * 86400000;
const clean = ({ validationState, ...op }) => op;
const only = (input, keys) =>
  input &&
  typeof input === "object" &&
  !Array.isArray(input) &&
  !Object.keys(input).some((k) => !keys.includes(k));
export function ciState(checks, combined) {
  const runs = checks.check_runs || [],
    statuses = combined.statuses || [];
  if (
    runs.some((c) =>
      [
        "failure",
        "timed_out",
        "cancelled",
        "action_required",
        "startup_failure",
        "stale",
      ].includes(c.conclusion),
    ) ||
    statuses.some((c) => ["failure", "error"].includes(c.state))
  )
    return "failed";
  if (
    runs.some((c) => c.status !== "completed") ||
    statuses.some((c) => c.state === "pending")
  )
    return "running";
  if (
    (checks.total_count ?? runs.length) > runs.length ||
    (combined.total_count ?? statuses.length) > statuses.length ||
    (!runs.length && !statuses.length)
  )
    return "unknown";
  return runs.every((c) =>
    ["success", "neutral", "skipped"].includes(c.conclusion),
  ) && statuses.every((c) => c.state === "success")
    ? "success"
    : "unknown";
}
export class Submissions {
  constructor(store, secret, github, owner) {
    Object.assign(this, { store, secret, github, owner });
    this.workspace = new WorkspaceStore(store, secret);
  }
  async get(id) {
    if (!/^[\w-]{43}$/.test(id || "")) fail(400, "submission_id");
    const v = await this.store.get("submission-v2:" + id);
    if (!v) fail(404, "submission_not_found");
    const record = await open(v.encrypted, this.secret);
    if (record.protocol !== 2 || record.owner !== this.owner)
      fail(403, "submission_owner");
    return record;
  }
  async pack(r) {
    if (new TextEncoder().encode(JSON.stringify(r)).length > 1400000)
      fail(413, "submission_size_split");
    return { encrypted: await seal(r, this.secret) };
  }
  async put(r) {
    await this.store.put(
      "submission-v2:" + r.id,
      await this.pack(r),
      Date.now() + days,
    );
  }
  async ids() {
    return (await this.store.get("submission-index-v2:" + this.owner)) || [];
  }
  async remember(r) {
    const ids = await this.ids();
    if (!ids.includes(r.id)) {
      ids.push(r.id);
      if (ids.length > 100) ids.splice(0, ids.length - 100);
      await this.store.put(
        "submission-index-v2:" + this.owner,
        ids,
        Date.now() + days,
      );
    }
    await this.put(r);
  }
  async verifyBases(ops, snapshot) {
    const groups = new Map();
    for (const op of ops)
      if (op.before) {
        const names = groups.get(op.baseCommit) || new Set();
        names.add(entities[op.entity].file);
        groups.set(op.baseCommit, names);
      }
    if (groups.size > 4) fail(409, "baseline_budget_split");
    for (const [sha, names] of groups) {
      const baseline =
        sha === snapshot.sha
          ? snapshot
          : await this.github.snapshot(sha, [...names]);
      for (const op of ops.filter((o) => o.baseCommit === sha && o.before))
        if (!equal(recordAt(baseline.models, op), op.before))
          fail(409, "baseline_mismatch:" + op.key);
    }
  }
  async preview(input) {
    if (
      !only(input, ["protocol", "revision", "keys", "reason"]) ||
      input.protocol !== 2 ||
      !Number.isSafeInteger(input.revision) ||
      !Array.isArray(input.keys) ||
      !input.keys.length ||
      input.keys.length > 120 ||
      new Set(input.keys).size !== input.keys.length ||
      (input.reason != null &&
        (typeof input.reason !== "string" || input.reason.length > 500))
    )
      fail(400, "submission_protocol");
    const w = await this.workspace.get(this.owner);
    if (!w || w.revision !== input.revision)
      fail(409, "workspace_revision_conflict");
    const ops = input.keys.map((key) => {
      const o = w.operations.find((o) => o.key === key);
      if (!o) fail(400, "unknown_operation");
      return clean(o);
    });
    const head = await this.github.call(
      "/repos/" + repository + "/git/ref/heads/main",
    );
    const id = await hash({
      owner: this.owner,
      workspaceId: w.workspaceId,
      ops: [...ops].sort((a, b) =>
        a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
      ),
      sha: head.object.sha,
      reason: input.reason?.trim() || null,
    });
    const previous = await this.store.get("submission-preview-v2:" + id);
    if (previous) {
      const cached = await open(previous.encrypted, this.secret);
      if (
        cached.protocol === 2 &&
        cached.owner === this.owner &&
        cached.expiresAt > Date.now()
      )
        return this.review(cached);
    }
    const snapshot = await this.github.snapshot(head.object.sha);
    await this.verifyBases(ops, snapshot);
    const plan = await planSubmission(snapshot, ops, {
      actor: this.owner,
      batchId: id,
      reason: input.reason,
    });
    if (plan.conflicts) return { state: "conflict", ...plan };
    const confirmationHash = await hash({
      id,
      sha: snapshot.sha,
      files: plan.files,
    });
    const r = {
      protocol: 2,
      id,
      owner: this.owner,
      workspaceId: w.workspaceId,
      workspaceRevision: w.revision,
      keys: input.keys,
      operations: ops,
      reason: input.reason?.trim() || null,
      state: "ready",
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 600000,
      confirmationHash,
      plan: { ...plan, sha: snapshot.sha, tree: snapshot.tree },
    };
    await this.store.put(
      "submission-preview-v2:" + id,
      await this.pack(r),
      r.expiresAt,
    );
    return this.review(r);
  }
  review(r) {
    return {
      protocol: 2,
      id: r.id,
      state: r.state,
      error: r.error || null,
      confirmationHash: r.confirmationHash,
      baseCommit: r.plan.sha,
      title: r.plan.title,
      summary: r.plan.summary,
      records: r.plan.impact.records,
      dependencies: dependencies(r.operations),
      diff: r.plan.diff,
    };
  }
  async submit(input) {
    if (
      !only(input, ["protocol", "previewId", "confirmationHash"]) ||
      input.protocol !== 2 ||
      !/^[\w-]{43}$/.test(input.previewId || "")
    )
      fail(400, "submission_protocol");
    let r;
    try {
      r = await this.get(input.previewId);
    } catch (e) {
      if (e.message !== "submission_not_found") throw e;
      const cached = await this.store.get(
        "submission-preview-v2:" + input.previewId,
      );
      if (!cached) fail(409, "preview_expired");
      r = await open(cached.encrypted, this.secret);
    }
    if (r.protocol !== 2 || r.owner !== this.owner)
      fail(403, "submission_owner");
    if (input.confirmationHash !== r.confirmationHash)
      fail(400, "field_confirmation_required");
    if (r.result) {
      await this.consume(r);
      return { state: "submitted", ...r.result };
    }
    if (!r.journal && r.expiresAt < Date.now()) fail(409, "preview_expired");
    const current = await this.github.call(
      "/repos/" + repository + "/git/ref/heads/main",
    );
    if (current.object.sha !== r.plan.sha) {
      if (r.journal?.commit) {
        const existing = await this.github.call(
          "/repos/" +
            repository +
            "/pulls?state=all&head=jigjpwiki:admin/change-" +
            r.id +
            "&base=main",
        );
        const pr = existing.find(
          (p) =>
            p.head?.sha === r.journal.commit &&
            p.head.ref === "admin/change-" + r.id &&
            p.head.repo?.full_name === repository &&
            p.base?.ref === "main",
        );
        if (pr) {
          if (
            !Number.isInteger(pr.number) ||
            !pr.html_url?.startsWith(
              "https://github.com/" + repository + "/pull/",
            )
          )
            fail(503, "pr_confirmation_missing");
          r.result = { number: pr.number, url: pr.html_url, recovered: true };
          r.state = "submitted";
          r.head = r.journal.commit;
          await this.put(r);
          await this.consume(r);
          return { state: "submitted", ...r.result };
        }
      }
      fail(409, "main_changed_reload");
    }
    r.state = "submitting";
    r.journal ||= {};
    await this.remember(r);
    try {
      const result = await this.github.publish(
        r.plan,
        r.id,
        r.journal,
        async (journal) => {
          r.journal = journal;
          await this.put(r);
        },
      );
      if (
        !Number.isInteger(result.number) ||
        !result.url?.startsWith("https://github.com/" + repository + "/pull/")
      )
        fail(503, "pr_confirmation_missing");
      r.result = result;
      r.state = "submitted";
      r.head = r.journal.commit;
      await this.put(r);
      await this.consume(r);
      return { state: r.state, ...result };
    } catch (e) {
      r.state = "failed";
      r.error = e?.status ? e.message : "internal_error";
      await this.put(r);
      throw e;
    }
  }
  async consume(r) {
    const w = await this.workspace.get(this.owner);
    if (!w || w.workspaceId !== r.workspaceId) return;
    const hashes = new Map(
      await Promise.all(r.operations.map(async (o) => [o.key, await hash(o)])),
    );
    const keep = [];
    for (const o of w.operations)
      if (hashes.get(o.key) !== (await hash(clean(o)))) keep.push(clean(o));
    if (keep.length !== w.operations.length)
      await this.workspace.save(this.owner, {
        protocol: 1,
        revision: w.revision,
        operations: keep,
      });
  }
  async list(offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100)
      fail(400, "invalid_cursor");
    const out = [];
    for (const id of (await this.ids())
      .slice()
      .reverse()
      .slice(offset, offset + 20)) {
      let r;
      try {
        r = await this.get(id);
      } catch (e) {
        if (e.message === "submission_not_found") continue;
        throw e;
      }
      out.push({
        id: r.id,
        state: r.state,
        title: r.plan.title,
        createdAt: r.createdAt,
        owner: r.owner,
        count: r.operations.length,
        result: r.result,
        status: await this.store.get("submission-status-v2:" + r.id),
      });
    }
    return out;
  }
  async legacyList() {
    let list = await this.store.get("admin-pr-index-v2");
    if (!list) {
      const prs = await this.github.call(
        "/repos/" +
          repository +
          "/pulls?state=all&base=main&sort=updated&direction=desc&per_page=50",
      );
      list = prs
        .filter(
          (p) =>
            p.head?.ref.startsWith("admin/change-") &&
            p.base?.ref === "main" &&
            p.head.repo?.full_name === repository,
        )
        .map((p) => ({
          number: p.number,
          title: p.title,
          url: p.html_url,
          createdAt: p.created_at,
          creator: p.user?.login || null,
          state: p.merged_at ? "merged" : p.state,
        }));
      await this.store.put("admin-pr-index-v2", list, Date.now() + 60000);
    }
    const own = new Set();
    for (const id of await this.ids()) {
      try {
        const r = await this.get(id);
        if (r.result) own.add(r.result.number);
      } catch (e) {
        if (e.message !== "submission_not_found") throw e;
      }
    }
    return list.filter((p) => !own.has(p.number));
  }
  async readCI(sha) {
    const base = "/repos/" + repository + "/commits/" + sha;
    const results = await Promise.allSettled([
      this.github.call(base + "/check-runs?per_page=100"),
      this.github.call(base + "/status?per_page=100"),
    ]);
    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) =>
        /^github_(?:\d{3}|unavailable|response_invalid)$/.test(
          r.reason?.message || "",
        )
          ? r.reason.message
          : "ci_unavailable",
      );
    return {
      checks:
        results[0].status === "fulfilled"
          ? results[0].value
          : { check_runs: [] },
      combined:
        results[1].status === "fulfilled" ? results[1].value : { statuses: [] },
      error: errors[0] || null,
    };
  }
  async legacyStatus(number) {
    if (!Number.isSafeInteger(number) || number < 1) fail(400, "invalid_pr");
    const cached = await this.store.get("legacy-pr-status-v2:" + number);
    if (cached) return cached;
    const base = "/repos/" + repository,
      pr = await this.github.call(base + "/pulls/" + number);
    if (
      !pr.head?.ref.startsWith("admin/change-") ||
      pr.base?.ref !== "main" ||
      pr.head.repo?.full_name !== repository
    )
      fail(403, "not_admin_pull_request");
    const ci = await this.readCI(pr.head.sha),
      checks = ci.checks,
      statuses = ci.combined;
    const runs = checks.check_runs || [],
      states = statuses.statuses || [];
    const result = {
      legacy: true,
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.merged ? "merged" : pr.state,
      mergeable: pr.mergeable,
      ci:
        ci.error && ciState(checks, statuses) !== "failed"
          ? "unknown"
          : ciState(checks, statuses),
      ciError: ci.error,
      checks: [
        ...runs.map((c) => ({
          name: c.name,
          status: c.conclusion || c.status,
          url: c.html_url,
        })),
        ...states.map((s) => ({
          name: s.context,
          status: s.state,
          url: s.target_url,
        })),
      ],
    };
    await this.store.put(
      "legacy-pr-status-v2:" + number,
      result,
      Date.now() + 60000,
    );
    return result;
  }
  async status(id, refresh = false) {
    const r = await this.get(id);
    if (!r.result) return { ...this.review(r), result: r.result };
    let status = await this.store.get("submission-status-v2:" + id);
    if (!status || (refresh && Date.now() - status.fetchedAt >= 60000)) {
      const base = "/repos/" + repository,
        pr = await this.github.call(base + "/pulls/" + r.result.number);
      if (
        pr.base.ref !== "main" ||
        pr.head.ref !== "admin/change-" + r.id ||
        pr.head.repo?.full_name !== repository
      )
        fail(409, "not_admin_pull_request");
      const ci = await this.readCI(pr.head.sha),
        checks = ci.checks,
        combined = ci.combined;
      const runs = checks.check_runs || [],
        statuses = combined.statuses || [];
      const failed =
        runs.some((c) =>
          [
            "failure",
            "timed_out",
            "cancelled",
            "action_required",
            "startup_failure",
            "stale",
          ].includes(c.conclusion),
        ) || statuses.some((s) => ["failure", "error"].includes(s.state));
      const pending =
        runs.some((c) => c.status !== "completed") ||
        statuses.some((s) => s.state === "pending");
      const success =
        !ci.error &&
        (checks.total_count ?? runs.length) <= runs.length &&
        (combined.total_count ?? statuses.length) <= statuses.length &&
        !failed &&
        !pending &&
        runs.length + statuses.length > 0 &&
        runs.every((c) =>
          ["success", "neutral", "skipped"].includes(c.conclusion),
        ) &&
        statuses.every((s) => s.state === "success");
      let required = null,
        rules = null;
      try {
        required = await this.github.call(
          base + "/branches/main/protection/required_status_checks",
        );
      } catch {}
      try {
        rules = await this.github.call(base + "/rules/branches/main");
      } catch {}
      const requiredKnown =
        required !== null &&
        Array.isArray(rules) &&
        !rules.some((r) =>
          ["workflows", "required_workflows"].includes(r.type),
        );
      const requirements = requiredKnown
        ? [
            ...(required.contexts || []).map((context) => ({
              context,
              app: null,
            })),
            ...(required.checks || []).map((c) => ({
              context: c.context,
              app: c.app_id,
            })),
            ...rules
              .filter((r) => r.type === "required_status_checks")
              .flatMap((r) =>
                (r.parameters?.required_status_checks || []).map((c) => ({
                  context: c.context,
                  app: c.integration_id,
                })),
              ),
          ]
        : [];
      const requiredSuccess =
        requiredKnown &&
        requirements.every(
          ({ context, app }) =>
            runs.some(
              (c) =>
                c.name === context &&
                c.conclusion === "success" &&
                (!(Number.isInteger(app) && app >= 0) || c.app?.id === app),
            ) ||
            (!(Number.isInteger(app) && app >= 0) &&
              statuses.some(
                (c) => c.context === context && c.state === "success",
              )),
        );
      status = {
        fetchedAt: Date.now(),
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.merged ? "merged" : pr.state,
        head: pr.head.sha,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state || "unknown",
        ci:
          ci.error && ciState(checks, combined) !== "failed"
            ? "unknown"
            : ciState(checks, combined),
        ciError: ci.error,
        requiredKnown,
        canMerge:
          pr.state === "open" &&
          !pr.merged &&
          pr.mergeable === true &&
          pr.mergeable_state === "clean" &&
          !rules?.some((r) => r.type === "merge_queue") &&
          success &&
          requiredSuccess,
        checks: [
          ...runs.map((c) => ({
            name: c.name,
            status: c.conclusion || c.status,
            url: c.html_url,
          })),
          ...statuses.map((c) => ({
            name: c.context,
            status: c.state,
            url: c.target_url,
          })),
        ],
      };
      await this.store.put(
        "submission-status-v2:" + id,
        status,
        Date.now() + 60000,
      );
    }
    return { ...this.review(r), result: r.result, status };
  }
  async updatePreview(id, resolutions) {
    const r = await this.get(id);
    if (!r.result) fail(409, "submission_not_submitted");
    const pr = await this.github.call(
      "/repos/" + repository + "/pulls/" + r.result.number,
    );
    if (
      pr.state !== "open" ||
      pr.merged ||
      pr.base.ref !== "main" ||
      pr.head.ref !== "admin/change-" + id ||
      pr.head.repo?.full_name !== repository ||
      !r.head ||
      pr.head.sha !== r.head
    )
      fail(409, "admin_branch_conflict");
    const snapshot = await this.github.snapshot();
    if (snapshot.sha === r.plan.sha) fail(409, "no_main_change");
    let updateOperations = structuredClone(r.operations);
    let plan = await planSubmission(snapshot, updateOperations, {
      actor: this.owner,
      batchId: await hash({ id, sha: snapshot.sha }),
      branchId: id,
      reason: r.reason,
    });
    if (plan.conflicts && resolutions) {
      if (
        !Array.isArray(resolutions) ||
        resolutions.length !== plan.conflicts.length
      )
        fail(400, "invalid_resolution");
      for (const current of plan.currentRecords) {
        const op = updateOperations.find((o) => o.key === current.key);
        if (!current.before) fail(409, "record_deleted");
        op.before = current.before;
        op.baseCommit = snapshot.sha;
        op.value = current.value;
      }
      const seen = new Set();
      for (const c of plan.conflicts) {
        const choices = resolutions.filter(
          (r) =>
            only(r, ["key", "field", "choice"]) &&
            r.key === c.key &&
            r.field === c.field &&
            ["ours", "theirs"].includes(r.choice),
        );
        if (choices.length !== 1 || seen.has(c.key + ":" + c.field))
          fail(400, "invalid_resolution");
        seen.add(c.key + ":" + c.field);
        const op = updateOperations.find((o) => o.key === c.key),
          keys = c.field.split("/").slice(1),
          value = c[choices[0].choice];
        if (c.field === "/") {
          op.value = value;
          continue;
        }
        let o = op.value;
        for (const key of keys.slice(0, -1)) o = o[key];
        if (value === undefined) delete o[keys.at(-1)];
        else o[keys.at(-1)] = value;
      }
      plan = await planSubmission(snapshot, updateOperations, {
        actor: this.owner,
        batchId: await hash({ id, sha: snapshot.sha }),
        branchId: id,
        reason: r.reason,
      });
    }
    if (plan.conflicts) return { state: "conflict", ...plan };
    for (const [k, v] of Object.entries(r.plan.files))
      if (k.startsWith("audit:")) {
        const sha = snapshot.auditShas?.[filePath(k)];
        if (sha) {
          const blob = await this.github.call(
            "/repos/" + repository + "/git/blobs/" + sha,
          );
          if (blob.encoding !== "base64" || blob.size > 1400000)
            fail(409, "audit_history_conflict");
          let current;
          try {
            current = JSON.parse(
              new TextDecoder().decode(
                Uint8Array.from(atob(blob.content.replace(/\s/g, "")), (c) =>
                  c.charCodeAt(0),
                ),
              ),
            );
          } catch {
            fail(409, "audit_history_conflict");
          }
          if (!equal(current, v)) fail(409, "audit_history_conflict");
        }
        plan.files[k] = v;
      }
    const update = {
      ...r,
      plan: { ...plan, sha: snapshot.sha, tree: snapshot.tree },
      operations: updateOperations,
      metadata: {
        beforeTitle: pr.title,
        beforeBody: pr.body,
        auto:
          pr.title === "admin: " + r.plan.title &&
          pr.body === prDescription(r.plan),
      },
      expectedHead: pr.head.sha,
      expiresAt: Date.now() + 600000,
    };
    update.confirmationHash = await hash({
      id,
      sha: snapshot.sha,
      head: pr.head.sha,
      files: plan.files,
    });
    await this.store.put(
      "submission-update-v2:" + id,
      await this.pack(update),
      update.expiresAt,
    );
    return {
      ...this.review(update),
      update: true,
      preserveMetadata: !update.metadata.auto,
    };
  }
  async update(id, input) {
    if (!only(input, ["protocol", "confirmationHash"]) || input.protocol !== 2)
      fail(400, "submission_protocol");
    const cached = await this.store.get("submission-update-v2:" + id);
    if (!cached) fail(409, "preview_expired");
    const u = await open(cached.encrypted, this.secret),
      r = await this.get(id);
    if (
      u.owner !== this.owner ||
      u.protocol !== 2 ||
      input.confirmationHash !== u.confirmationHash
    )
      fail(400, "field_confirmation_required");
    const base = "/repos/" + repository,
      pr = await this.github.call(base + "/pulls/" + r.result.number),
      ref = await this.github.call(base + "/git/ref/heads/main");
    if (
      r.updatePending &&
      pr.state === "open" &&
      !pr.merged &&
      pr.base.ref === "main" &&
      pr.head.ref === "admin/change-" + id &&
      pr.head.repo?.full_name === repository &&
      pr.head.sha === r.updatePending.commit
    )
      return this.completeUpdate(r, u, pr, true);
    if (
      pr.state !== "open" ||
      pr.merged ||
      pr.head.ref !== "admin/change-" + id ||
      pr.head.repo?.full_name !== repository ||
      pr.base.ref !== "main" ||
      pr.head.sha !== u.expectedHead ||
      ref.object.sha !== u.plan.sha
    )
      fail(409, "admin_branch_conflict");
    if (u.expiresAt < Date.now() && !r.updatePending)
      fail(409, "preview_expired");
    if (
      u.metadata?.auto &&
      (pr.title !== u.metadata.beforeTitle || pr.body !== u.metadata.beforeBody)
    )
      fail(409, "admin_branch_conflict");
    await this.store.put(
      "submission-update-v2:" + id,
      await this.pack(u),
      Date.now() + days,
    );
    // Fast-forward-only: a concurrent commit not in our ancestry makes GitHub reject the ref write.
    const tree = await this.github.call(base + "/git/trees", "POST", {
      base_tree: u.plan.tree,
      tree: Object.entries(u.plan.files).map(([name, value]) => {
        if (
          !files.includes(name) &&
          !(/^audit:[\w-]{43}$/.test(name) && value.version === 2)
        )
          fail(400, "invalid_write_target");
        return {
          path: filePath(name),
          type: "blob",
          mode: "100644",
          content: JSON.stringify(value, null, 2) + "\n",
        };
      }),
    });
    const commit = await this.github.call(base + "/git/commits", "POST", {
      message: "admin: 安全なmain再適用 " + id,
      tree: tree.sha,
      parents: [u.expectedHead, u.plan.sha],
    });
    r.updatePending = { commit: commit.sha, expectedHead: u.expectedHead };
    await this.put(r);
    await this.github.call(
      base + "/git/refs/heads/admin/change-" + id,
      "PATCH",
      { sha: commit.sha, force: false },
    );
    return this.completeUpdate(
      r,
      u,
      { ...pr, head: { ...pr.head, sha: commit.sha } },
      false,
    );
  }
  async completeUpdate(r, u, pr, recovered) {
    pr = await this.github.call(
      "/repos/" + repository + "/pulls/" + r.result.number,
    );
    if (
      pr.state !== "open" ||
      pr.merged ||
      pr.base.ref !== "main" ||
      pr.head.ref !== "admin/change-" + r.id ||
      pr.head.repo?.full_name !== repository ||
      pr.head.sha !== r.updatePending.commit
    )
      fail(409, "admin_branch_conflict");
    let metadataPreserved = !u.metadata?.auto;
    if (u.metadata?.auto) {
      const desiredTitle = "admin: " + u.plan.title,
        desiredBody = prDescription(u.plan);
      if (pr.title === desiredTitle && pr.body === desiredBody) {
      } else if (
        pr.title === u.metadata.beforeTitle &&
        pr.body === u.metadata.beforeBody
      ) {
        const result = await this.github.call(
          "/repos/" + repository + "/pulls/" + r.result.number,
          "PATCH",
          { title: desiredTitle, body: desiredBody },
        );
        if (
          result.number !== r.result.number ||
          result.title !== desiredTitle ||
          result.body !== desiredBody
        )
          fail(503, "pr_confirmation_missing");
      } else metadataPreserved = true; // A human edited the PR text; do not overwrite it.
    }
    r.head = r.updatePending.commit;
    r.plan = u.plan;
    r.operations = u.operations;
    delete r.updatePending;
    await this.put(r);
    await this.store.delete("submission-status-v2:" + r.id);
    await this.store.delete("submission-update-v2:" + r.id);
    return { state: "submitted", ...r.result, recovered, metadataPreserved };
  }
}
