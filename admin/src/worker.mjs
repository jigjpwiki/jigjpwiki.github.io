import { recoverAppliedGroup } from "./cms-recover-draft.mjs";
import { youtubeVideoLookup } from "./cms-music.mjs";
import { readCmsHistory, prepareAuditReversal, assertReversalRoundTrip } from "./cms-history.mjs";
import { inspectDraftConflicts } from "./cms-conflicts.mjs";
import { publicationPlan } from "./cms-publish.mjs";
import { CmsJobs } from "./cms-jobs.mjs";
import { publishingEnabled } from "./github-app.mjs";
import { prepareDraft, draftDetails, draftInput, draftGroups, writeDraft, draftConflict } from "./cms-draft.mjs";
import { cmsPermissions } from "./cms-scope.mjs";
import { createCmsReader } from "./cms-read.mjs";
import { normalizeScope, scopedCatalog } from "./cms-scope.mjs";
import { googleAuth, googleEnabled, emailKey } from "./google.mjs";
import {
  Failure,
  fail,
  json,
  headers,
  random,
  hash,
  seal,
  open,
  cookie,
  cookies,
  body,
  allow,
  csrf,
} from "./security.mjs";
import { GitHub, repository } from "./github.mjs";
import { preview, forms } from "./model.mjs";
import { Submissions } from "./submissions.mjs";
import { finalizeAudit, planSubmission } from "./submission-plan.mjs";
import { WorkspaceStore, workspaceLimits } from "./workspace.mjs";
import migration from "../../lib/source-migration.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      if (env.ADMIN_ENABLED !== "true")
        return json({ error: "admin_not_enabled" }, 503);
      return env.ADMIN.get(env.ADMIN.idFromName("jigwiki-admin-v1")).fetch(
        request,
      );
    }
    const response = await env.ASSETS.fetch(request);
    const h = new Headers(response.headers);
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; connect-src 'self'; img-src 'self' https:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    h.set("Referrer-Policy", "no-referrer");
    h.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers: h });
  },
};
export class Admin {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.transport = env.__testFetch || ((...args) => fetch(...args));
    this.cmsSnapshot = createCmsReader(this.transport);
    this.cmsVideoLookup = youtubeVideoLookup(env.YOUTUBE_API_KEY, this.transport);
    if (env.__testStore) this.store = env.__testStore;
    else {
      state.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL)",
      );
      const sql = state.storage.sql;
      this.store = {
        get: async (key) => {
          const row = [
            ...sql.exec("SELECT value,expires FROM entries WHERE key=?", key),
          ][0];
          return row && row.expires > Date.now() ? JSON.parse(row.value) : null;
        },
        put: async (key, value, expires) => {
          sql.exec(
            "INSERT OR REPLACE INTO entries(key,value,expires) VALUES(?,?,?)",
            key,
            JSON.stringify(value),
            expires,
          );
        },
        delete: async (key) => {
          sql.exec("DELETE FROM entries WHERE key=?", key);
        },
        members: async () => [...sql.exec("SELECT value FROM entries WHERE key GLOB 'member:*' ORDER BY key LIMIT 100")].map((row) => JSON.parse(row.value)),
        clean: async () =>
          sql.exec("DELETE FROM entries WHERE expires<?", Date.now()),
      };
    }
  }
  async fetch(request) {
    try {
      return await this.handle(request);
    } catch (e) {
      return json(
        { error: e instanceof Failure ? e.message : "internal_error" },
        e instanceof Failure ? e.status : 500,
      );
    }
  }
  atomic(callback) {
    return this.state.blockConcurrencyWhile
      ? this.state.blockConcurrencyWhile(async () => {
          // Let the request handler translate expected failures without resetting the object.
          try { return { value: await callback() }; }
          catch (error) { return { error }; }
        }).then(({ value, error }) => {
          if (error) throw error;
          return value;
        })
      : callback();
  }
  async alarm() {
    await new CmsJobs(this).alarm();
  }
  async handle(request) {
    const url = new URL(request.url),
      now = Date.now();
    await this.store.clean?.();
    if (
      !this.env.GITHUB_CLIENT_ID ||
      !this.env.GITHUB_CLIENT_SECRET ||
      !this.env.SESSION_KEY ||
      !this.env.ADMIN_USER_IDS
    )
      fail(503, "auth_configuration");
    if (request.method === "GET" && url.pathname === "/auth/options")
      return json({ google: googleEnabled(this.env) });
    if (request.method === "GET" && ["/auth/google/login", "/auth/google/callback"].includes(url.pathname))
      return googleAuth(request, this.env, this.store, this.transport, now, (callback) => this.atomic(callback));
    if (url.pathname === "/auth/login" && request.method === "GET") {
      if (url.protocol !== "https:" && !this.env.__testStore)
        fail(400, "https_required");
      const state = random(),
        verifier = random();
      await this.store.put(
        "oauth:" + state,
        { verifier, origin: url.origin },
        now + 300000,
      );
      const login = new URL("https://github.com/login/oauth/authorize");
      login.search = new URLSearchParams({
        client_id: this.env.GITHUB_CLIENT_ID,
        redirect_uri: url.origin + "/auth/callback",
        state,
        code_challenge: await hash(verifier),
        code_challenge_method: "S256",
      }).toString();
      return new Response(null, {
        status: 302,
        headers: {
          ...headers,
          Location: login.href,
          "Set-Cookie": cookie("__Host-admin-oauth", state, 300),
        },
      });
    }
    if (url.pathname === "/auth/callback" && request.method === "GET") {
      const state = url.searchParams.get("state"),
        saved = state && (await this.store.get("oauth:" + state));
      if (
        !saved ||
        cookies(request)["__Host-admin-oauth"] !== state ||
        saved.origin !== url.origin ||
        !url.searchParams.get("code")
      )
        fail(403, "oauth_state_invalid");
      await this.store.delete("oauth:" + state);
      let response;
      try {
        response = await this.transport(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: this.env.GITHUB_CLIENT_ID,
              client_secret: this.env.GITHUB_CLIENT_SECRET,
              code: url.searchParams.get("code"),
              redirect_uri: url.origin + "/auth/callback",
              code_verifier: saved.verifier,
            }),
          },
        );
      } catch {
        fail(503, "oauth_unavailable");
      }
      if (response.status >= 300 && response.status < 400)
        fail(503, "oauth_redirect_rejected");
      const token = await response.json();
      if (!response.ok || typeof token.access_token !== "string" || token.error)
        fail(401, "oauth_exchange_failed");
      const github = new GitHub(token.access_token, this.transport),
        user = await github.identity();
      allow(user, this.env);
      const id = random();
      const session = {
        id: String(user.id),
        login: user.login,
        csrf: random(),
        token: await seal(token.access_token, this.env.SESSION_KEY),
        expires: now + 1800000,
      };
      await this.store.put("session:" + id, session, session.expires);
      const out = new Response(null, {
        status: 302,
        headers: { ...headers, Location: url.origin + "/" },
      });
      out.headers.append(
        "Set-Cookie",
        cookie("__Host-admin-session", id, 1800),
      );
      out.headers.append("Set-Cookie", cookie("__Host-admin-oauth", "", 0));
      return out;
    }
    const sid = cookies(request)["__Host-admin-session"];
    const session =
      sid &&
      /^[\w-]{43}$/.test(sid) &&
      (await this.store.get("session:" + sid));
    if (!session || session.expires <= now) fail(401, "login_required");
    if (session.provider !== "google") allow(session, this.env);
    if (!["GET", "HEAD"].includes(request.method)) csrf(request, session);
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      await this.store.delete("session:" + sid);
      return json({ ok: true }, 200, {
        "Set-Cookie": cookie("__Host-admin-session", "", 0),
      });
    }
    let github;
    const google = session.provider === "google";
    if (!google) {
      github = new GitHub(
        await open(session.token, this.env.SESSION_KEY),
        this.transport,
      );
      const identity = await github.identity();
      if (String(identity.id) !== session.id)
        fail(403, "session_identity_changed");
      allow(identity, this.env);
    }
    let googleMember, entry;
    if (google) {
      if (!googleEnabled(this.env)) fail(401, "login_required");
      entry = await this.store.get(session.memberKey);
      const member = googleMember = entry && await open(entry, this.env.SESSION_KEY);
      if (!member || member.disabled || member.id !== session.id || member.revision !== session.revision)
        fail(401, "login_required");
      if (url.pathname === "/api/me" && request.method === "GET")
        return json({ id: session.id, role: member.role, provider: "google", csrf: session.csrf, expires: session.expires });
      if (url.pathname === "/api/cms/publication/reconcile" && request.method === "POST") {
        const input = await body(request, 512);
        return json({ publication: await new CmsJobs(this).reconcile(session, input?.jobId) });
      }
      if (url.pathname === "/api/cms/publication") {
        const jobs = new CmsJobs(this);
        if (request.method === "GET") return json({ publication: await jobs.status(session.id) });
        if (request.method === "POST") return json({ publication: await jobs.enqueue(session, await body(request, 4096)) }, 202);
      }
    }
    const cmsRoutes = ["/api/cms/catalog", "/api/cms/detail", "/api/cms/draft", "/api/cms/draft/conflicts", "/api/cms/history", "/api/cms/publication/reapply"];
    if (cmsRoutes.includes(url.pathname)) {
      await this.atomic(async () => {
        const key = "cms-rate:" + sid;
        const rate = await this.store.get(key) || { count: 0, expires: now + 60000 };
        if (rate.count >= 30) fail(429, "admin_request_limit");
        await this.store.put(key, { ...rate, count: rate.count + 1 }, rate.expires);
      });
      const snapshot = await this.cmsSnapshot({
        revalidate: request.method !== "GET" || url.pathname === "/api/cms/draft/conflicts",
      });
      const requireCurrentGrant = async () => {
        if (google ? entry !== await this.store.get(session.memberKey) || !googleEnabled(this.env)
          : !(await this.store.get("session:" + sid)) || session.expires <= Date.now())
          fail(401, "login_required");
      };
      await requireCurrentGrant();
      const { models } = snapshot;
      const member = google ? googleMember : {
        role: "editor", owner: true, scope: {
          categories: ["talents", "anniversaries", "events", "music", "goods"],
          organizations: models.talents.organizations.map(({ id }) => id), groups: [],
        },
      };
      if (url.pathname === "/api/cms/catalog" && request.method === "GET") {
        const access = cmsPermissions(models, { ...member, scope: {
          ...member.scope, categories: ["talents"],
        } });
        return json({
          sha: snapshot.sha, sections: scopedCatalog(models, member), owner: member.owner === true,
          songs: member.scope?.categories.includes("music")
            ? models.music.songs.filter((song) => song.visibility === "public")
              .map(({ id, title, originalArtists }) => ({ id, name: title + (originalArtists?.length ? " / " + originalArtists.join("、") : "") }))
            : [],
          editable: member.role === "editor", publicationTracking: google, publishable: member.role === "editor" && member.directPublish === true && publishingEnabled(this.env), categories: member.scope?.categories ?? [],
          organizations: models.talents.organizations.filter((row) => member.scope?.organizations.includes(row.id)),
          people: models.talents.talents.filter((row) => access.canRead("talent", row))
            .map((row) => ({ id: row.id, name: row.displayName })),
        });
      }
      if (url.pathname === "/api/cms/detail" && request.method === "GET")
        return json({ sha: snapshot.sha, fields: draftDetails(snapshot, member, url.searchParams.get("entity"), url.searchParams.get("id")) });
      if (url.pathname === "/api/cms/publication/reapply" && request.method === "POST") {
        if (!google || member.role !== "editor") fail(403, "cms_scope_denied");
        const input = await body(request, 1024);
        if (typeof input?.draftId !== "string" || !Number.isInteger(input.revision))
          fail(400, "cms_reapply_invalid");
        const jobs = new CmsJobs(this);
        const workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
        const job = await jobs.confirmedJob(session.id, input.jobId);
        if (!job) fail(409, "cms_reapply_unavailable");
        const saved = await workspace.get(session.id);
        if (!saved || saved.revision !== input.revision) fail(409, "workspace_revision_conflict");
        const group = draftGroups(saved.operations).get(input.draftId);
        const submitted = draftGroups(job.operations).get(input.draftId);
        if (!group || !submitted?.some((op) => !op.id)) fail(409, "cms_reapply_unavailable");
        const published = await this.cmsSnapshot({ revision: job.commit });
        const recovered = recoverAppliedGroup(group, submitted, job, published);
        if (!recovered) fail(409, "cms_reapply_unavailable");
        await publicationPlan(snapshot, { ...job, operations: recovered },
          { ...member, directPublish: true }, this.cmsVideoLookup);
        const replaced = new Map(recovered.map((op) => [op.key, op]));
        const operations = saved.operations.map(({ validationState, ...op }) => replaced.get(op.key) || op);
        return this.atomic(async () => {
          await requireCurrentGrant();
          const result = await workspace.save(session.id, { protocol: 1, revision: input.revision, operations });
          await jobs.markRecovered(session.id, saved.workspaceId, input.draftId);
          return json({ revision: result.revision });
        });
      }
      if (url.pathname === "/api/cms/history") {
        const context = { snapshot, member, github, transport: this.transport, repository };
        if (request.method === "GET") {
          const batchId = url.searchParams.get("batchId");
          const result = await readCmsHistory({
            ...context, batchId, offset: Number(url.searchParams.get("offset") ?? 0),
          });
          await requireCurrentGrant();
          if (batchId && !result.summary.operations.length) fail(403, "cms_scope_denied");
          return json(batchId ? { ...result.summary, sha: snapshot.sha } : result);
        }
        if (request.method === "POST") {
          if (member.role !== "editor") fail(403, "cms_scope_denied");
          const input = await body(request, 1024);
          if (typeof input?.batchId !== "string" || typeof input.operationId !== "string" || typeof input.recordId !== "string")
            fail(400, "cms_history_invalid");
          if (input.sha !== snapshot.sha) fail(409, "main_changed_reload");
          const { audit } = await readCmsHistory({ ...context, batchId: input.batchId });
          const operation = prepareAuditReversal(snapshot, member, audit, input.batchId, input.operationId, input.recordId);
          await assertReversalRoundTrip(snapshot, member, operation, this.cmsVideoLookup);
          const job = { id: input.batchId, owner: session.id, operations: [operation],
            createdAt: new Date().toISOString() };
          if (google) await publicationPlan(snapshot, job, { ...member, directPublish: true }, this.cmsVideoLookup);
          else await planSubmission(snapshot, job.operations, {
            actor: String(session.id), batchId: await hash(job.id + snapshot.sha),
          });
          const workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
          return this.atomic(async () => {
            await requireCurrentGrant();
            const previous = await workspace.get(session.id);
            if (previous?.operations.some(({ entity, id }) => entity === operation.entity && id === operation.id))
              fail(409, "cms_history_existing_draft");
            const batch = writeDraft(previous?.operations || [], undefined, [operation]);
            const saved = await workspace.save(session.id, {
              protocol: 1, revision: input.revision, operations: batch.operations,
            });
            return json({ revision: saved.revision, draftId: batch.id });
          });
        }
      }
      if (url.pathname === "/api/cms/draft/conflicts") {
        const workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
        const saved = await workspace.get(session.id);
        if (request.method === "GET") {
          const group = draftGroups(saved?.operations).get(url.searchParams.get("draftId"));
          const { conflicts } = inspectDraftConflicts(snapshot, member, group);
          await requireCurrentGrant();
          return json({ conflicts, revision: saved.revision, sha: snapshot.sha });
        }
        if (request.method === "PUT") {
          const input = await body(request, 16000);
          if (!Array.isArray(input?.choices)) fail(400, "cms_conflict_choice");
          if (input.sha !== snapshot.sha) fail(409, "main_changed_reload");
          if (!saved || saved.revision !== input.revision) fail(409, "workspace_revision_conflict");
          const group = draftGroups(saved.operations).get(input.draftId);
          const { resolved, unchanged } = inspectDraftConflicts(snapshot, member, group, input.choices);
          const changes = resolved.map(({ validationState, ...op }) => op);
          if (!unchanged) {
            const job = { id: input.draftId, owner: session.id, operations: changes,
              createdAt: new Date().toISOString() };
            if (google) await publicationPlan(snapshot, job, { ...member, directPublish: true }, this.cmsVideoLookup);
            else await planSubmission(snapshot, changes, {
              actor: String(session.id), batchId: await hash(job.id + snapshot.sha),
            });
          }
          const replaces = new Map(group.map((op, index) => [op, changes[index]]));
          const operations = saved.operations.flatMap(({ validationState, ...op }, index) => {
            const source = saved.operations[index];
            if (!replaces.has(source)) return [op];
            return unchanged ? [] : [replaces.get(source)];
          });
          return this.atomic(async () => {
            await requireCurrentGrant();
            const result = await workspace.save(session.id, { protocol: 1, revision: input.revision, operations });
            return json({ revision: result.revision });
          });
        }
      }
      if (url.pathname === "/api/cms/draft") {
        if (member.role !== "editor") fail(403, "cms_scope_denied");
        const workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
        if (request.method === "GET") {
          const saved = await workspace.get(session.id);
          const drafts = [];
          for (const [draftId, group] of draftGroups(saved?.operations)) {
            const input = draftInput({ operations: group });
            if (!input) continue;
            try {
              const current = await prepareDraft(snapshot, member, { ...input, sha: snapshot.sha }, this.cmsVideoLookup);
              const conflict = draftConflict(draftId, group, current);
              drafts.push({ draftId, conflict, input: { ...input, sha: snapshot.sha } });
            } catch (error) {
              if (!(error instanceof Failure)) throw error;
              drafts.push({ draftId, conflict: true, input: null });
            }
          }
          await requireCurrentGrant();
          return json({ revision: saved?.revision ?? 0, drafts });
        }
        if (request.method === "DELETE") {
          const input = await body(request, 1000);
          if (typeof input?.draftId !== "string") fail(400, "cms_invalid_input");
          return this.atomic(async () => {
            await requireCurrentGrant();
            const previous = await workspace.get(session.id);
            const { operations } = writeDraft(previous?.operations || [], input.draftId);
            const saved = await workspace.save(session.id, { protocol: 1, revision: input.revision, operations });
            return json({ revision: saved.revision });
          });
        }
        if (request.method === "PUT") {
          const input = await body(request, 16000);
          if (!input || typeof input !== "object") fail(400, "cms_invalid_input");
          const operations = await prepareDraft(snapshot, member, input, this.cmsVideoLookup);
          return this.atomic(async () => {
            await requireCurrentGrant();
            const previous = await workspace.get(session.id);
            const batch = writeDraft(previous?.operations || [], input.draftId, operations);
            const saved = await workspace.save(session.id, { protocol: 1, revision: input.revision, operations: batch.operations });
            return json({ revision: saved.revision, draftId: batch.id });
          });
        }
      }
    }
    if (google) fail(403, "google_route_not_enabled");
    if (url.pathname === "/api/me" && request.method === "GET")
      return json({
        id: session.id,
        login: session.login,
        role: "owner",
        simpleCms: true,
        csrf: session.csrf,
        expires: session.expires,
        repository,
      });
    const rateKey = "rate:" + sid;
    const rate = (await this.store.get(rateKey)) || { count: 0, start: now };
    if (rate.count >= 30) fail(429, "admin_request_limit");
    rate.count++;
    await this.store.put(rateKey, rate, rate.start + 60000);
    if (url.pathname === "/api/members" && request.method === "GET") {
      const entries = await this.store.members();
      const members = await Promise.all(entries.map(async (entry) => {
        const { email, id, role, disabled, sub, expires, scope, directPublish } = await open(entry, this.env.SESSION_KEY);
        return { email, id, role, disabled, accepted: Boolean(sub), expires, scope: normalizeScope(scope), directPublish: directPublish === true };
      }));
      return json({ members });
    }
    if (url.pathname === "/api/members" && request.method === "POST") {
      const input = await body(request, 4096);
      if (!input || typeof input.email !== "string" || input.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+$/.test(input.email) ||
          !["editor", "viewer"].includes(input.role) || typeof input.disabled !== "boolean")
        fail(400, "invalid_member");
      const scope = normalizeScope(input.scope);
      if (input.directPublish !== undefined && typeof input.directPublish !== "boolean")
        fail(400, "invalid_member_scope");
      if (scope.organizations.length || scope.groups.length) {
        const { models } = await github.snapshot(undefined, ["talents", "catalog"]);
        if (scope.organizations.some((id) => !models.talents.organizations.some((organization) => organization.id === id)) ||
            scope.groups.some((id) => !models.catalog.groups.some((group) => group.id === id && group.visibility === "public")))
          fail(400, "invalid_member_scope");
      }
      const key = await emailKey(input.email);
      return this.atomic(async () => {
        const entry = await this.store.get(key);
        const previous = entry && await open(entry, this.env.SESSION_KEY);
        if (!previous && (await this.store.members()).length >= 100) fail(409, "member_limit");
        const member = {
          email: input.email.toLowerCase(),
          id: previous?.id || crypto.randomUUID(),
          sub: previous?.sub || null,
          role: input.role,
          scope,
          directPublish: input.role === "editor" && input.directPublish === true,
          disabled: input.disabled,
          revision: random(),
          expires: now + 7 * 86400_000,
        };
        await this.store.put(key, await seal(member, this.env.SESSION_KEY), Number.MAX_SAFE_INTEGER);
        return json({ id: member.id, role: member.role, disabled: member.disabled });
      });
    }
    if (url.pathname.startsWith("/api/submissions")) {
      const service = new Submissions(
        this.store,
        this.env.SESSION_KEY,
        github,
        session.id,
      );
      const route = url.pathname;
      if (route === "/api/submissions" && request.method === "GET")
        return json({
          submissions: await service.list(
            Number(url.searchParams.get("cursor") || 0),
          ),
          legacy: await service.legacyList(),
          total: (await service.ids()).length,
        });
      const legacy = route.match(/^\/api\/submissions\/legacy\/(\d+)$/);
      if (legacy && request.method === "GET")
        return json(await service.legacyStatus(Number(legacy[1])));
      const match = route.match(
        /^\/api\/submissions\/([\w-]{43})(?:\/(update-preview|update))?$/,
      );
      if (match && request.method === "GET" && !match[2])
        return json(
          await service.status(
            match[1],
            url.searchParams.get("refresh") === "1",
          ),
        );
      if (request.method !== "POST") fail(404, "route_not_found");
      const input = await body(
        request,
        match?.[2] === "update-preview" ? workspaceLimits.bytes : 16000,
      );
      if (route === "/api/submissions/preview")
        return json(await service.preview(input));
      if (match?.[2] === "update-preview") {
        if (
          input.protocol !== 2 ||
          Object.keys(input).some(
            (k) => !["protocol", "resolutions"].includes(k),
          )
        )
          fail(400, "submission_protocol");
        return json(await service.updatePreview(match[1], input.resolutions));
      }
      return this.state.blockConcurrencyWhile(async () => {
        try {
          if (route === "/api/submissions")
            return json(await service.submit(input));
          if (match?.[2] === "update")
            return json(await service.update(match[1], input));
          fail(404, "route_not_found");
        } catch (e) {
          return json(
            { error: e instanceof Failure ? e.message : "internal_error" },
            e instanceof Failure ? e.status : 500,
          );
        }
      });
    }
    if (url.pathname === "/api/workspace") {
      const workspace = new WorkspaceStore(this.store, this.env.SESSION_KEY);
      if (request.method === "GET")
        return json({
          workspace: await workspace.get(session.id),
          limits: workspaceLimits,
        });
      if (request.method === "PUT") {
        const input = await body(request, workspaceLimits.bytes);
        return this.state.blockConcurrencyWhile(async () => {
          try {
            return json({
              workspace: await workspace.save(session.id, input),
              limits: workspaceLimits,
            });
          } catch (e) {
            return json(
              { error: e instanceof Failure ? e.message : "internal_error" },
              e instanceof Failure ? e.status : 500,
            );
          }
        });
      }
      fail(405, "method_not_allowed");
    }
    if (url.pathname === "/api/forms" && request.method === "GET")
      return json(forms);
    if (url.pathname === "/api/masters" && request.method === "GET") {
      const snapshot = await github.snapshot();
      return json({
        sha: snapshot.sha,
        shas: snapshot.shas,
        models: migration.migrateModels(snapshot.models),
        migrationPending: migration.names.some(
          (name) => snapshot.models[name]?.schemaVersion !== 2,
        ),
      });
    }
    if (
      url.pathname === "/api/change-requests/preview" &&
      request.method === "POST"
    ) {
      const input = await body(request),
        snapshot = await github.snapshot();
      if (input.evidence || input.sources) fail(409, "admin_updated_reload");
      if (input.sha !== snapshot.sha) fail(409, "main_changed_reload");
      const plan = await preview(snapshot, input, { actor: session.id });
      const id = await hash({
        actor: session.id,
        sha: snapshot.sha,
        input: {
          ...input,
        },
      });
      if (await this.store.get("operation:" + id))
        fail(409, "operation_already_submitted");
      const cached = await this.store.get("preview:" + id);
      if (cached)
        return json({
          id,
          title: cached.title,
          summary: cached.summary,
          diff: cached.diff,
          impact: cached.impact,
          files: Object.keys(cached.files),
        });
      await finalizeAudit(plan, snapshot, {
        actor: session.id,
        batchId: id,
        reason: input.reason,
      });
      plan.auditProtocol = 2;
      plan.sourceFreeProtocol = 3;
      plan.sha = snapshot.sha;
      plan.tree = snapshot.tree;
      plan.shas = snapshot.shas;
      plan.actor = session.id;
      plan.key = id;
      await this.store.put("preview:" + id, plan, now + 600000);
      return json({
        id,
        title: plan.title,
        summary: plan.summary,
        diff: plan.diff,
        impact: plan.impact,
        files: Object.keys(plan.files),
        expires: now + 600000,
      });
    }
    if (url.pathname === "/api/change-requests" && request.method === "POST") {
      const input = await body(request, 2048);
      if (
        Object.keys(input).some((k) => k !== "previewId") ||
        !/^[\w-]{43}$/.test(input.previewId || "")
      )
        fail(400, "preview_id_required");
      return this.state.blockConcurrencyWhile(async () => {
        try {
          const key = input.previewId;
          let record = await this.store.get("operation:" + key);
          if (record?.actor !== undefined && record.actor !== session.id)
            fail(403, "operation_owner");
          if (record?.result) return json(record.result);
          const plan = (await this.store.get("preview:" + key)) || record?.plan;
          if (!plan || plan.actor !== session.id) fail(409, "preview_expired");
          if (
            !(
              (plan.sourceFreeProtocol === 1 && !plan.contentProtocol) ||
              (plan.sourceFreeProtocol === 2 && plan.contentProtocol === 1) ||
              (plan.sourceFreeProtocol === 3 &&
                plan.auditProtocol === 2 &&
                [undefined, 1].includes(plan.contentProtocol))
            ) ||
            plan.migrationPending ||
            (record && !record.plan?.sourceFreeProtocol)
          )
            fail(409, "migration_pending_reload");
          if (!record) {
            const current = await github.call(
              "/repos/" + repository + "/git/ref/heads/main",
            );
            if (current.object.sha !== plan.sha)
              fail(409, "main_changed_reload");
            record = {
              actor: session.id,
              plan: {
                sourceFreeProtocol: plan.sourceFreeProtocol,
                auditProtocol: plan.auditProtocol,
                contentProtocol: plan.contentProtocol,
                sha: plan.sha,
                tree: plan.tree,
                files: plan.files,
                title: plan.title,
                summary: plan.summary,
                actor: plan.actor,
                key,
              },
            };
            await this.store.put("operation:" + key, record, now + 86400000);
          }
          const save = async (value) =>
            this.store.put("operation:" + key, value, now + 86400000);
          const result = await github.publish(plan, key, record, save);
          record.result = result;
          await save(record);
          return json(result);
        } catch (e) {
          return json(
            { error: e instanceof Failure ? e.message : "internal_error" },
            e instanceof Failure ? e.status : 500,
          );
        }
      });
    }
    if (
      /^\/api\/pull-requests\/\d+$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      const pr = await github.call(
        "/repos/" + repository + "/pulls/" + url.pathname.split("/").pop(),
      );
      if (!pr.head.ref.startsWith("admin/change-") || pr.base.ref !== "main")
        fail(403, "not_admin_pull_request");
      return json({ url: pr.html_url, state: pr.state, merged: pr.merged });
    }
    fail(404, "route_not_found");
  }
}
