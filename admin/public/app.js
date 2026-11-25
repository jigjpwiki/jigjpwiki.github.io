import { renderOutcome } from "./review-outcome.js";
import { mountRecordBrowser } from "./record-browser.js";
import { mountIntentEditor } from "./intent-editor.js";
import {
  localIssues,
  projectedModels,
  referencesTo,
} from "./talent-actions.js";
import { referenceModels } from "./row-projection.js";
import { mountDataTable } from "./data-table.js";
import { columnsFor, overlayRows } from "./table-columns.js";
import { detailPanel } from "./detail-panel.js";
import { mountSubmissions } from "./submissions.js";
import { Workspace, withoutSubmitted } from "./workspace.js";
import { mountContent } from "./content-manager.js";
import { labels as contentLabels } from "./content-fields.js";
import { createEditor } from "./editor.js";
import { fieldChanges, fieldLabel } from "./draft.js";
import { portrait } from "./controls.js";
const $ = (s) => document.querySelector(s);
// Small local SVG icon set; no CDN, fonts or runtime HTML injection.
const navIcons = {
  "#dashboard": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "#drafts": "M6 3h8l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6",
  "#publication": "M12 16V4 M7 9l5-5 5 5 M4 15v5h16v-5",
  "#history": "M3 12a9 9 0 1 1 3 7 M3 4v8h8 M12 7v5l4 2",
  "#search": "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  "#content/talent": "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
  "#content/organization": "M4 21V3h16v18 M2 21h20 M8 7h2 M14 7h2 M8 11h2 M14 11h2 M8 15h2 M14 15h2 M10 21v-3h4v3",
  "#content/group": "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3 M16 4a4 4 0 0 1 0 7 M18 14a5 5 0 0 1 4 5v2",
  "#content/anniversary": "M3 6h18v15H3z M7 3v6 M17 3v6 M3 11h18 M7 15h2 M12 15h2 M17 15h1",
  "#content/event": "M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18 M10 13l5 3-5 3z",
  "#content/song": "M9 18V5l12-3v13 M9 18a3 3 0 1 1-3-3h3 M21 15a3 3 0 1 1-3-3h3",
  "#content/musicVideo": "M3 5h18v14H3z M10 9l5 3-5 3z",
  "#content/video": "M3 6h12v12H3z M15 10l6-4v12l-6-4",
  "#content/karaoke": "M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  "#content/performance": "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5",
  "#content/product": "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  "#content/campaign": "M3 9v6h4l10 4V5L7 9z M7 15l2 6h4 M20 9v6",
  "#content/offer": "M4 8h16l1 13H3z M8 8V6a4 4 0 0 1 8 0v2",
  "#settings": "M10 2h4l1 3 3 1 3-1 2 4-2 3 1 3-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 1-3-2-3 2-4 3 1 3-1z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
};
for (const link of document.querySelectorAll(".cms-navigation a")) {
  const path = navIcons[link.hash];
  if (!path) continue;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(key, value);
  const line = document.createElementNS(ns, "path");
  line.setAttribute("d", path);
  svg.append(line);
  link.prepend(svg);
}
document.querySelector(".skip-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  $("#main-content").focus();
});
let me, workspace, resumeOperationKey;
const workspaceLabels = {
  saved: "保存済み",
  unsaved: "未保存",
  saving: "自動保存中…",
  failed: "保存失敗（入力は保持しています）",
  conflict: "別タブと競合しています",
  loading: "下書きを読み込み中…",
};
document.addEventListener("inline-state", () => renderSaveState());
function inlinePending() {
  return Boolean(document.querySelector("[data-uncommitted-cell]"));
}
function renderSaveState() {
  const bar = document.querySelector("#workspace-bar");
  if (!bar || !workspace) return;
  let checks = document.querySelector("#local-checks");
  if (!checks) {
    checks = node("section");
    checks.id = "local-checks";
    checks.setAttribute("role", "status");
    bar.after(checks);
  }
  const issues = snapshot?.models
    ? localIssues(projectedModels(snapshot.models, workspace.operations))
    : [];
  checks.replaceChildren();
  checks.hidden = !issues.length;
  if (issues.length) {
    checks.className = "validation-message stack";
    checks.append(node("h3", "下書きに確認が必要です"));
    for (const issue of issues) {
      checks.append(
        node("p", `${issue.name} / ${issue.field}：${issue.message}`),
      );
      if (issue.references?.length)
        checks.append(
          node(
            "p",
            issue.references.map((r) => `${r.title}（${r.id}）`).join("・"),
          ),
        );
      checks.append(
        button("掲載方針を確認：" + issue.name, () => intentScreen([issue.id])),
      );
    }
  }

  bar.querySelector("[data-save-state]").textContent =
    `${inlinePending() ? "セルを編集中（Enterで確定 / Escで取消）" : workspaceLabels[workspace.state]} / ${workspace.operations.length}件`;
  bar.querySelector("[data-save-state]").dataset.state = inlinePending()
    ? "editing"
    : workspace.state;
  if (workspace.updatedAt)
    bar.querySelector("[data-save-state]").title =
      "最終保存 " +
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(workspace.updatedAt) +
      " JST";
  if (inlinePending())
    showStatus("セルをEnterで確定するか、Escで取り消してください。");
  else if (workspace.state === "saved")
    showStatus("下書きは保存済みです。公開データは変更していません。");
  else if (workspace.state === "unsaved")
    showStatus(
      "変更は下書きです。自動保存を待つか「下書きを保存」を押してください。",
    );
  else if (workspace.state === "saving") showStatus("下書きを保存中です。");
  else if (workspace.state === "failed" || workspace.state === "conflict")
    showStatus(workspace.error || workspaceLabels[workspace.state]);
}
function setupWorkspaceBar() {
  const bar = node("section");
  bar.id = "workspace-bar";
  bar.setAttribute("aria-label", "変更ワークスペース");
  const state = node("span");
  state.dataset.saveState = "";
  state.setAttribute("role", "status");
  bar.append(
    state,
    button("下書きを保存", () => {
      if (inlinePending()) {
        showStatus("セルをEnterで確定するか、Escで取り消してください。");
        return;
      }
      return workspace.save();
    }),
    button("元に戻す", () => {
      if (inlinePending())
        return showStatus("編集中のセルを確定または取り消してください。");
      workspace.history("undo");
      if (activeEditor?.refresh) activeEditor.refresh();
      else {
        activeEditor = null;
        screen();
      }
    }),
    button("やり直す", () => {
      if (inlinePending())
        return showStatus("編集中のセルを確定または取り消してください。");
      workspace.history("redo");
      if (activeEditor?.refresh) activeEditor.refresh();
      else {
        activeEditor = null;
        screen();
      }
    }),
  );
  const a = node("a", "変更内容");
  a.href = "#workspace";
  bar.append(a);
  $("#app").insertBefore(bar, $("#view"));
  renderSaveState();
}
function submissionView(options = {}) {
  const previous = activeEditor;
  activeEditor = mountSubmissions({
    container: $("#view"),
    workspace,
    api,
    ...options,
    onRefresh: renderSaveState,
    onStatus: showStatus,
    resume: (op) => {
      if (["talent", "organization", "group"].includes(op.entity)) {
        entity = op.entity;
        edit(op.before, op);
      } else {
        const category = schemas.content.types[op.entity].category;
        resumeOperationKey = op.key;
        if (location.hash === "#" + category) screen();
        else location.hash = "#" + category;
      }
    },
  });
}
function workspaceView() {
  submissionView();
}

export async function api(path, method = "GET", value) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(me ? { "X-CSRF-Token": me.csrf } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && me && workspace) showAuthRecovery();
    const error = new Error(
      {
        submission_protocol:
          "管理画面を再読み込みし、もう一度確認してください。",
        unknown_operation:
          "選択した下書きが見つかりません。保存済み変更を確認してください。",
        missing_dependency:
          "必要な関連変更が選択されていません。「関連変更も選択」を利用してください。",
        baseline_mismatch:
          "編集開始時の値がGitHubの履歴と一致しません。下書きを確認してください。",
        baseline_budget_split:
          "編集開始時点が多いためAPI予算を超えます。選択を分けてください。",
        submission_size_split:
          "提出データが上限を超えました。選択を分けてください。",
        admin_branch_conflict:
          "PRブランチまたはmainが更新されました。差分を再確認してください。",
        no_main_change: "mainは前回の確認時点から更新されていません。",
        preview_expired:
          "プレビューの有効期限が切れました。もう一度プレビューしてください。",
        temporary_failure:
          "一時的に保存できませんでした。再度保存してください。",
        workspace_revision_conflict:
          "別タブに新しい保存があります。入力は保持しました。変更内容画面から確認してください。",
        workspace_operation_limit:
          "下書きは120件までです。変更を分割してください。",
        workspace_size_limit:
          "下書きの容量上限を超えました。変更を分割してください。",
        payload_limit:
          "送信できる容量の上限を超えました。入力は保持しています。",
        admin_updated_reload:
          "管理画面が更新されました。再読み込みしてください。",
        migration_pending_reload:
          "データ移行中です。移行完了後に再読み込みしてプレビューし直してください。",
        main_changed_reload:
          "mainが更新されました。最新mainを再読み込みし、変更を再確認してください。",
        references_prevent_deletion:
          "関連データまたは収集・キャッシュの参照が残るため削除できません。",
        draft_has_public_references:
          "公開状態の影響確認が必要です。状態・掲載を変更から、公開履歴への名前掲載または関連情報の非公開を確認してください。",
        references_prevent_hiding_review_history_first:
          "公開済みの参照が残っています。履歴を維持する対応方針を先にレビューしてください。",
        official_profile_identity_already_registered:
          "同じ公式プロフィールのIDが登録済みです。重複と改名を確認してください。",
        duplicate_offer:
          "同じ商品の販売情報が重複しています。既存Offerの編集か、異なる販売期間かを確認してください。",
        parent_relationship_mismatch:
          "商品・販売情報・歌唱記録の関連先が編集中の親レコードと一致しません。",
        record_exists_select_existing:
          "動画は登録済みです。既存の動画情報を選択して再利用してください。",
        slot_history_must_be_retained:
          "登録済みの出演枠は削除できません。過去の履歴を保持してください。",
        field_confirmation_required: "変更内容をもう一度確認してください。",
        confirmation_name_and_id_required:
          "対象IDと表示名を正確に入力してください。",
      }[data.error?.split(":")[0]] ||
        data.error ||
        "通信に失敗しました",
    );
    error.code = data.error;
    throw error;
  }
  return data;
}
function showAuthRecovery() {
  if (document.querySelector("#auth-recovery")) return;
  const panel = node("section");
  panel.id = "auth-recovery";
  panel.className = "error-summary";
  panel.setAttribute("role", "alert");
  const title = node("h2", "ログインの有効期限が切れました"),
    message = node(
      "p",
      "入力はこのタブに保持しています。再読み込みせず、別タブで同じ管理者としてログインしてください。",
    ),
    login = node("a", "別タブで再ログイン");
  login.href = "/auth/login";
  login.target = "_blank";
  login.rel = "noopener";
  panel.append(
    title,
    message,
    login,
    button("ログインを確認して保存を再試行", async () => {
      const next = await api("/api/me");
      if (
        String(next.id) !== String(me.id) ||
        next.repository !== me.repository
      ) {
        message.textContent =
          "別の管理者では再開できません。元のアカウントでログインしてください。入力は保持しています。";
        return;
      }
      me = next;
      try {
        await workspace.flush();
        panel.remove();
        showStatus("認証を確認し、下書きを保存しました。");
      } catch (e) {
        message.textContent =
          "認証は確認できましたが保存できませんでした。入力を保持しています。" +
          e.message;
      }
    }),
  );
  $("#workspace-bar").after(panel);
}
export const showStatus = (value) => {
  $("#status").textContent = value;
};
export const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
function screen() {
  if (!me) return;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.hash === (location.hash || "#dashboard")) {
      a.setAttribute("aria-current", "page");
      const group = a.closest("details");
      if (group && !group.hidden) group.open = true;
    } else a.removeAttribute("aria-current");
  }
  const settings = location.hash === "#settings";
  $("#view").replaceChildren(
    node("h2", settings ? "設定" : "ダッシュボード"),
    node(
      "p",
      settings
        ? "認証と数値ユーザーIDの許可リストはサーバーで管理します。Secretsの表示・変更機能はありません。"
        : "編集は下書きとして保存されます。変更内容を確認してPRを作成し、人間がレビュー・マージします。",
    ),
  );
}
let acceptedHash = location.hash;
let navigationRevision = 0;
window.addEventListener("hashchange", async () => {
  const revision = ++navigationRevision;
  const usesCms = (hash) => hash === "#cms" || hash === "#dashboard" || hash.startsWith("#content/") || ["#drafts", "#publication", "#history", "#search"].includes(hash);
  const view = $("#view");
  if (!view) return;
  view.inert = false;
  if ((activeEditor?.dirty || document.querySelector("[data-cms-dirty]")) && !mayLeave()) {
    history.replaceState(null, "", acceptedHash || "#masters");
    return;
  }
  if (me?.simpleCms && workspace && usesCms(location.hash) !== usesCms(acceptedHash)) {
    if (workspace?.dirty) {
      history.replaceState(null, "", acceptedHash || "#dashboard");
      showStatus("変更内容を保存してから編集モードを切り替えてください。");
      return;
    }
    if (usesCms(acceptedHash) && !usesCms(location.hash)) {
      view.inert = true;
      try {
        await workspace.load();
      } catch {
        if (revision === navigationRevision) {
          history.replaceState(null, "", acceptedHash || "#dashboard");
          showStatus("下書きを取得できませんでした。");
        }
        return;
      } finally {
        if (revision === navigationRevision) view.inert = false;
      }
      if (revision !== navigationRevision) return;
      view.replaceChildren(node("p", "読み込み中…"));
    }
  }
  activeEditor = null;
  acceptedHash = location.hash;
  const workspaceBar = $("#workspace-bar");
  if (workspaceBar) workspaceBar.hidden = usesCms(location.hash);
  screen();
});
async function start() {
  fetch("/auth/options").then((response) => response.json()).then(({ google }) => {
    $("#google-login").hidden = google !== true;
  }).catch(() => {});

  try {
    me = await api("/api/me");
    $("#login").hidden = true;
    $("#app").hidden = false;
    me.simpleCms = me.simpleCms || me.provider === "google";
    if (me.provider === "google") {
      document.querySelectorAll("[data-owner-only]").forEach((item) => { item.hidden = true; });
      $("#identity").textContent = me.role === "viewer" ? "閲覧者" : "編集者";
      $("#logout").onclick = async () => {
        if (!mayLeave()) return;
        await api("/auth/logout", "POST", {});
        location.reload();
      };
      if (!location.hash) history.replaceState(null, "", "#dashboard");
      acceptedHash = location.hash;
      screen();
      return;
    }
    if (me.simpleCms) {
      $("#simple-cms-link").hidden = false;
      if (!location.hash) {
        history.replaceState(null, "", "#dashboard");
        acceptedHash = "#dashboard";
      }
    }
    $("#identity").textContent = `${me.login} / 管理者 / ${me.repository}`;
    $("#logout").onclick = async () => {
      if (!mayLeave()) return;
      if (workspace?.dirty) await workspace.flush();
      activeEditor = null;
      await api("/auth/logout", "POST", {});
      location.reload();
    };
    workspace = new Workspace(api, renderSaveState);
    setupWorkspaceBar();
    $("#workspace-bar").hidden = location.hash === "#dashboard" || location.hash === "#cms" || location.hash.startsWith("#content/");
    try {
      await workspace.load();
    } catch (e) {
      workspace.state = "failed";
      workspace.error = e.message;
      renderSaveState();
    }
    screen();
  } catch (e) {
    showStatus(
      e.message === "login_required"
        ? "GitHubでログインしてください。"
        : e.message,
    );
  }
}
start();
// Master editor: values remain in memory; only server-created previews can be submitted.
let snapshot,
  schemas,
  entity = "talent",
  page = 0;
const labels = {
  talent: "VTuber",
  organization: "事務所",
  group: "グループ",
  displayName: "表示名",
  name: "名前・別名",
  aliases: "旧名・別名",
  affiliations: "所属履歴",
  agencyStatus: "事務所所属状態",
  activityStatus: "VTuber活動状態",
  accounts: "公式アカウント",
  organizationId: "所属事務所",
  status: "状態",
  value: "値",
  from: "開始日（不明ならnull）",
  to: "終了日（不明ならnull）",
  service: "サービス",
  accountId: "アカウントID（不明ならnull）",
  url: "URL",
  wiki: "非公式Wiki",
  profileImage: "プロフィール画像",
  talentIds: "メンバーID",
  membersComplete: "メンバー一覧確認済み",
  visibility: "公開状態",
  id: "固定内部ID",
};
const enumLabels = {
  unknown: "不明",
  public: "公開",
  draft: "非公開",
  current: "現在の所属",
  former: "旧所属",
  active: "活動中",
  hiatus: "活動休止",
  retired: "引退（確認済み）",
  ended: "活動終了",
  affiliated: "所属中",
  unaffiliated: "未所属",
  youtube: "YouTube",
  x: "X",
  twitch: "Twitch",
  tiktok: "TikTok",
  former_name: "旧名",
  alias: "別名",
};
const initial = {
  talent: {
    displayName: "",
    aliases: [],
    affiliations: [],
    agencyStatus: { value: "unknown" },
    activityStatus: { value: "unknown" },
    accounts: [],
    wiki: null,
    profileImage: null,
    visibility: "public",
  },
  organization: { name: "" },
  group: {
    name: "",
    organizationId: null,
    talentIds: [],
    membersComplete: false,
    visibility: "draft",
  },
};
const rows = () =>
  entity === "talent"
    ? snapshot.models.talents.talents
    : entity === "organization"
      ? snapshot.models.talents.organizations
      : snapshot.models.catalog.groups;
const button = (text, fn) => {
  const b = node("button", text);
  b.type = "button";
  b.onclick = () => Promise.resolve(fn()).catch((e) => showStatus(e.message));
  return b;
};
const link = (text, url) => {
  const a = node("a", text);
  try {
    const u = new URL(url);
    if (u.protocol === "https:") {
      a.href = u.href;
      a.rel = "noreferrer";
      a.target = "_blank";
    }
  } catch {}
  return a;
};
let referenceIndex;
function related(id) {
  if (!referenceIndex) {
    referenceIndex = new Map();
    function visit(v, path, file) {
      if (typeof v === "string" && /^(tal|org|group)-[0-9]{6}$/.test(v)) {
        if (
          (file === "talents" &&
            /^\/(talents|organizations)\/\d+\/id$/.test(path)) ||
          (file === "catalog" && /^\/groups\/\d+\/id$/.test(path))
        )
          return;
        const list = referenceIndex.get(v) || [];
        list.push(file + ": " + path);
        referenceIndex.set(v, list);
      } else if (Array.isArray(v))
        v.forEach((x, i) => visit(x, path + "/" + i, file));
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) visit(x, path + "/" + k, file);
    }
    for (const [file, m] of Object.entries(snapshot.models))
      if (!file.includes("registry") && file !== "admin-ledger")
        visit(m, "", file);
  }
  return referenceIndex.get(id) || [];
}
function accountReferences(record) {
  const keys = new Set(
      (record.accounts || [])
        .map((a) => a.accountId?.toLowerCase())
        .filter(Boolean),
    ),
    out = [];
  function visit(v, path, file) {
    if (typeof v === "string" && keys.has(v.toLowerCase()))
      out.push(file + ": " + path);
    else if (Array.isArray(v))
      v.forEach((x, i) => visit(x, path + "/" + i, file));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (keys.has(k.toLowerCase())) out.push(file + ": " + path + "/" + k);
        visit(x, path + "/" + k, file);
      }
  }
  for (const f of [
    "youtube_streamers",
    "twitch_streamers",
    "youtube_cache",
    "youtube",
    "twitch",
    "media",
  ])
    visit(snapshot.models[f], "", f);
  return out;
}
async function loadMasters(render = listView) {
  referenceIndex = undefined;
  showStatus("最新mainを読み込み中…");
  [snapshot, schemas] = await Promise.all([
    api("/api/masters"),
    api("/api/forms"),
  ]);
  showStatus("最新main: " + snapshot.sha.slice(0, 10));
  render();
}
let masterTable, masterPanel;
let masterBulk = false;
const browseStates = {};
function intentScreen(ids) {
  if (!ids.length) {
    showStatus("タレントを選択してください。一括編集から複数選択できます。");
    return;
  }
  masterPanel?.close();
  const host = $("#view");
  host.className = "intent-workspace";
  mountIntentEditor({
    container: host,
    models: snapshot.models,
    getOperations: () => workspace.operations,
    baseCommit: snapshot.sha,
    ids,
    onApply: (ops) => {
      workspace.replace(ops);
      listView();
      showStatus("変更案を下書きへ追加しました。まだ公開されていません。");
    },
    onBack: listView,
  });
  activeEditor = {
    get dirty() {
      return workspace.dirty;
    },
  };
}
function masterRows() {
  return overlayRows(rows(), workspace.operations, entity);
}
function masterChanges(changes) {
  const next = structuredClone(workspace.operations);
  for (const { record, value } of changes) {
    const old = next.find(
      (o) =>
        o.entity === entity &&
        ((record.id && o.id === record.id) ||
          (o.id || "@" + o.key) === record._reference),
    );
    const op = {
      key: old?.key || "draft-" + crypto.randomUUID(),
      entity,
      ...(record.id ? { id: record.id } : {}),
      baseCommit: old?.baseCommit || snapshot.sha,
      before: old?.before ?? rows().find((r) => r.id === record.id) ?? null,
      value,
    };
    const i = next.findIndex((o) => o.key === op.key);
    if (i < 0) next.push(op);
    else next[i] = op;
  }
  const issues = localIssues(projectedModels(snapshot.models, next));
  if (issues.length)
    throw Error(
      issues.map((e) => `${e.name} / ${e.field}：${e.message}`).join("\n"),
    );
  workspace.replace(next);
  renderSaveState();
}
function listView() {
  const view = $("#view");
  view.className = "management-layout";
  view.replaceChildren();
  const list = node("div");
  list.className = "list-region";
  view.append(list);
  const heading = node("div");
  heading.className = "page-header";
  heading.append(node("h2", labels[entity] + "管理"));
  const menu = node("div");
  menu.className = "content-toolbar";
  for (const type of Object.keys(initial))
    menu.append(
      button(labels[type], () => {
        entity = type;
        listView();
      }),
    );
  heading.append(
    menu,
    Object.assign(
      button("新規登録", () => edit()),
      { className: "primary" },
    ),
    button("最新mainを再読み込み", loadMasters),
  );
  list.append(heading);
  const table = node("div");
  list.append(table);
  if (masterBulk && entity === "talent")
    heading.append(
      button("選択した人物の状態・掲載を変更", () =>
        intentScreen(masterTable?.selected || []),
      ),
    );
  if (!masterBulk) {
    masterTable = mountRecordBrowser({
      container: table,
      title: labels[entity],
      entity,
      rows: masterRows,
      models: projectedModels(snapshot.models, workspace.operations),
      state: (browseStates[entity] ??= {}),
      columns: columnsFor(entity, { models: snapshot.models }),
      onOpen: detail,
      onBulk: () => {
        masterBulk = true;
        listView();
      },
    });
    activeEditor = {
      get dirty() {
        return workspace.dirty;
      },
      refresh: () => masterTable.refresh(),
    };
    return;
  }
  heading.append(
    button("通常一覧へ戻る", () => {
      masterBulk = false;
      listView();
    }),
  );
  masterTable = mountDataTable({
    container: table,
    title: labels[entity],
    queryLabel: "名前・IDで検索",
    columns: columnsFor(entity, {
      models: referenceModels(snapshot.models, workspace.operations),
    }),
    rows: masterRows,
    key: (r) => r.id || r._reference,
    baseline: (r) => rows().find((b) => b.id === r.id),
    onChange: masterChanges,
    onOpen: detail,
    filters:
      entity === "talent"
        ? [
            {
              key: "org-filter",
              label: "事務所で絞り込み",
              options: snapshot.models.talents.organizations.map((o) => [
                o.id,
                o.name,
              ]),
              test: (r, v) =>
                r.affiliations.some((a) => a.organizationId === v),
            },
            {
              key: "group-filter",
              label: "グループで絞り込み",
              options: snapshot.models.catalog.groups.map((g) => [
                g.id,
                g.name,
              ]),
              test: (r, v) =>
                snapshot.models.catalog.groups
                  .find((g) => g.id === v)
                  ?.talentIds.includes(r.id),
            },
            {
              key: "youtube-filter",
              label: "YouTube登録",
              options: [
                ["yes", "ID登録あり"],
                ["no", "未登録・不明"],
              ],
              test: (r, v) =>
                r.accounts.some(
                  (a) => a.service === "youtube" && a.accountId,
                ) ===
                (v === "yes"),
            },
            {
              key: "wiki-filter",
              label: "Wiki登録",
              options: [
                ["yes", "登録あり"],
                ["no", "登録なし"],
              ],
              test: (r, v) => !!r.wiki === (v === "yes"),
            },
            {
              key: "missing-filter",
              label: "情報不足",
              options: [["yes", "未確認・未登録項目あり"]],
              test: (r) =>
                !r.wiki ||
                !r.profileImage ||
                r.activityStatus.value === "unknown" ||
                !r.accounts.some((a) => a.service === "youtube" && a.accountId),
            },
          ]
        : [],
  });
  activeEditor = {
    get dirty() {
      return workspace.dirty;
    },
    refresh: () => masterTable.refresh(),
  };
}
function detail(record) {
  if (!record.id) {
    edit(
      undefined,
      workspace.operations.find(
        (o) => o.entity === entity && "@" + o.key === record._reference,
      ),
    );
    return;
  }
  masterPanel?.panel.remove();
  masterPanel = detailPanel($("#view"), {
    title: record.displayName || record.name,
    onClose: () => {
      const restore = browseStates[entity]?.scroll ?? window.scrollY;
      masterTable?.refresh();
      requestAnimationFrame(() => window.scrollTo(0, restore));
      activeEditor = {
        get dirty() {
          return workspace.dirty;
        },
        refresh: () => masterTable.refresh(),
      };
      return true;
    },
  });
  const view = masterPanel.content;
  view.classList.add("stack");
  const section = (name) => {
    const box = node("section");
    box.className = "page-section stack";
    box.append(node("h3", name));
    return box;
  };
  const model = projectedModels(snapshot.models, workspace.operations),
    profile = section("基本情報"),
    header = node("div");
  header.className = "inline profile-summary";
  if (entity === "talent")
    header.append(portrait(record.profileImage?.url, record.displayName));
  const identity = node("div");
  identity.className = "stack";
  identity.append(node("strong", record.displayName || record.name));
  if (record.aliases?.length)
    identity.append(
      node("span", "別名：" + record.aliases.map((a) => a.name).join("・")),
    );
  header.append(identity);
  profile.append(header);
  const actions = node("div");
  actions.className = "button-group";
  if (entity === "talent")
    actions.append(
      Object.assign(
        button("状態・掲載を変更", () => intentScreen([record.id])),
        { className: "primary" },
      ),
    );
  actions.append(
    button("編集", () => edit(record)),
    button("一覧へ戻る", listView),
  );
  view.replaceChildren(actions, profile);
  if (entity === "talent") {
    const status = section("活動・掲載");
    status.append(
      node("p", "活動：" + (enumLabels[record.activityStatus.value] || "不明")),
      node(
        "p",
        "所属状態：" + (enumLabels[record.agencyStatus.value] || "不明"),
      ),
      node(
        "p",
        "掲載：" +
          (record.visibility === "draft"
            ? record.historyNamePublic
              ? "プロフィール非表示・公開履歴に名前を掲載"
              : "非公開"
            : "公開"),
      ),
    );
    const affiliation = section("所属・グループ");
    for (const kind of ["current", "former"]) {
      const labels = record.affiliations
        .filter((a) => a.status === kind)
        .map(
          (a) =>
            model.talents.organizations.find((o) => o.id === a.organizationId)
              ?.name || "所属不明",
        );
      affiliation.append(
        node(
          "p",
          (kind === "current" ? "現在の事務所：" : "旧所属：") +
            (labels.join("・") || "登録なし"),
        ),
      );
    }
    const groups = model.catalog.groups
        .filter((g) => g.talentIds.includes(record.id))
        .map((g) => g.name),
      old = model.catalog.groups
        .filter((g) => g.formerTalentIds?.includes(record.id))
        .map((g) => g.name);
    affiliation.append(
      node("p", "現在のグループ：" + (groups.join("・") || "登録なし")),
    );
    if (old.length)
      affiliation.append(node("p", "過去のグループ：" + old.join("・")));
    const accounts = section("公式アカウント・リンク"),
      links = node("div");
    links.className = "inline";
    for (const a of record.accounts)
      links.append(
        link(
          { youtube: "YouTube", x: "X", twitch: "Twitch", tiktok: "TikTok" }[
            a.service
          ] || a.service,
          a.url,
        ),
      );
    if (record.wiki) links.append(link("非公式Wiki", record.wiki.url));
    if (record.officialProfileUrl)
      links.append(link("公式プロフィール", record.officialProfileUrl));
    accounts.append(
      links.children.length ? links : node("p", "リンクは登録されていません。"),
    );
    view.append(status, affiliation, accounts);
  } else if (entity === "group") {
    const membership = section("メンバー");
    for (const [k, label] of [
      ["talentIds", "現在の名簿"],
      ["formerTalentIds", "過去の名簿"],
    ])
      membership.append(
        node(
          "p",
          label +
            "：" +
            ((record[k] || [])
              .map(
                (id) =>
                  model.talents.talents.find((t) => t.id === id)?.displayName ||
                  "未登録",
              )
              .join("・") || "登録なし"),
        ),
      );
    view.append(membership);
  }
  const references = referencesTo(model, record.id),
    relatedBox = node("details");
  relatedBox.className = "page-section stack";
  relatedBox.append(
    node("summary", "履歴・関連情報（" + references.length + "件）"),
  );
  const names = {
    group: "グループ",
    anniversary: "記念日",
    event: "イベント",
    musicVideo: "歌動画",
    karaoke: "歌枠",
    performance: "歌唱記録",
    product: "商品",
    offer: "販売情報",
  };
  const list = node("ul");
  for (const ref of references)
    list.append(
      node(
        "li",
        (names[ref.entity] || "関連情報") +
          "：" +
          ref.title +
          "（" +
          ref.id +
          "）",
      ),
    );
  relatedBox.append(
    list,
    link(
      "GitHubで変更履歴を確認",
      "https://github.com/jigjpwiki/jigjpwiki.github.io/commits/main/data/" +
        (entity === "group" ? "catalog" : "talents") +
        ".json",
    ),
  );
  const history = snapshot.models["admin-ledger"].entries.filter(
    (e) => e.subject === record.id,
  );
  for (const h of history)
    relatedBox.append(
      node(
        "p",
        h.at +
          " / " +
          ({
            edit: "編集",
            create: "新規登録",
            visibility: "掲載変更",
            merge: "重複統合",
            delete: "削除",
          }[h.action] || "管理操作") +
          " / " +
          (h.reason || "理由の記載なし"),
      ),
    );
  view.append(relatedBox);
  const advanced = node("details");
  advanced.className = "page-section stack";
  advanced.append(
    node("summary", "高度な管理"),
    node("p", "固定ID：" + record.id + "（変更できません）"),
    node(
      "p",
      "配信収集・キャッシュ参照：" + accountReferences(record).length + "件",
    ),
    button("高度な管理（統合・削除等）", () => manage(record)),
  );
  view.append(advanced);
}
function approval(form, value, onPreview) {
  const reason = node("textarea");
  reason.setAttribute("aria-label", "変更理由");
  form.append(node("label", "変更理由"), reason);
  const checked = node("input");
  checked.type = "checkbox";
  checked.id = "change-confirmed";
  const label = node("label");
  label.append(
    checked,
    document.createTextNode("変更内容を確認しました（値変更時は再確認）"),
  );
  form.append(
    label,
    button("変更プレビュー", async () => {
      if (!checked.checked) throw new Error("変更内容の確認が必要です");
      await onPreview(
        {
          status: "confirmed",
          valueHash: await digest(value()),
        },
        reason.value,
      );
    }),
  );
}
async function digest(value) {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(value)),
        ),
      ),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
let activeEditor = null;
function mayLeave() {
  if (document.querySelector("[data-cms-dirty]"))
    return window.confirm("保存していない入力を破棄して移動しますか？");
  if (inlinePending()) {
    showStatus("編集中のセルをEnterで確定するか、Escで取り消してください。");
    return false;
  }
  if (activeEditor?.pending) {
    showStatus("検証が終わるまでお待ちください。");
    return false;
  }
  // Internal category navigation keeps the same Workspace and its retry state.
  // Page exit still warns; logout still flushes successfully before revocation.
  return (
    Boolean(workspace) ||
    !activeEditor?.dirty ||
    window.confirm("未保存の変更を確認してください。")
  );
}
window.addEventListener("beforeunload", (e) => {
  if (
    activeEditor?.pending ||
    document.querySelector("[data-cms-dirty]") ||
    inlinePending() ||
    workspace?.dirty ||
    (activeEditor?.dirty && !workspace)
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document
  .querySelector('nav[aria-label="管理ナビゲーション"]')
  .addEventListener("click", (e) => {
    if (e.target.closest("a") && activeEditor) {
      if (!mayLeave()) {
        e.preventDefault();
        return;
      }
      activeEditor = null;
      if (e.target.closest("a").hash === location.hash) {
        e.preventDefault();
        screen();
      }
    }
  });
function edit(record, savedOperation) {
  if (record) {
    record = structuredClone(rows().find((r) => r.id === record.id) || record);
    delete record._reference;
  }
  const staged =
    savedOperation ||
    (record?.id
      ? workspace?.operations.find(
          (o) => o.entity === entity && o.id === record.id,
        )
      : undefined);
  const operationKey = staged?.key || "draft-" + crypto.randomUUID();
  showStatus("編集中の変更は、PR作成までGitHubへ保存されません。");
  const view = masterPanel?.panel.isConnected
    ? masterPanel.content
    : $("#view");
  const open = () => {
    activeEditor = createEditor({
      container: view,
      entity,
      record,
      initial: initial[entity],
      savedValue: staged?.value,
      onDirty: () => {
        const value = activeEditor?.draft?.payload();
        if (!value) return;
        workspace?.upsert({
          key: operationKey,
          entity,
          ...(record ? { id: record.id } : {}),
          baseCommit: staged?.baseCommit || snapshot.sha,
          before: staged?.before || record || null,
          value,
        });
      },
      models: referenceModels(snapshot.models, workspace.operations),
      schemas,
      onCancel: () => {
        if (mayLeave()) {
          activeEditor = null;
          if (masterPanel?.panel.isConnected) masterPanel.close();
          else listView();
        }
      },
      onSelectRecord: (id) => {
        if (mayLeave()) {
          const other = rows().find((r) => r.id === id);
          if (other) edit(other);
        }
      },
      onPreview: async ({ value, reason }) =>
        showPreview(
          {
            sha: snapshot.sha,
            entity,
            action: "save",
            ...(record ? { id: record.id } : {}),
            value,
            reason,
            confirmation: {
              status: "confirmed",
              valueHash: await digest(value),
            },
          },
          operationKey,
        ),
    });
  };
  open();
}
function manage(record) {
  const view = $("#view");
  view.replaceChildren(
    button("詳細へ戻る", () => detail(record)),
    node("h2", "影響確認・管理対象変更"),
    node(
      "pre",
      [...related(record.id), ...accountReferences(record)].join("\n"),
    ),
  );
  const action = node("select");
  action.setAttribute("aria-label", "管理操作");
  for (const [v, n] of [
    ["merge", "重複統合"],
    ["delete", "完全削除案"],
    ["collection", "配信収集対象の変更"],
    ["wiki", "Wiki管理対象の変更"],
  ])
    if (entity === "talent" || ["merge", "delete"].includes(v))
      action.append(new Option(n, v));
  const mode = node("select");
  mode.setAttribute("aria-label", "変更後の管理対象");
  const modes = () => {
    mode.replaceChildren();
    for (const [v, n] of action.value === "visibility"
      ? [
          ["draft", "非公開"],
          ["public", "公開"],
        ]
      : [
          ["exclude", "対象から除外"],
          ["include", "対象に含める"],
        ])
      mode.append(new Option(n, v));
  };
  action.onchange = () => {
    modes();
    const c = $("#change-confirmed");
    if (c) c.checked = false;
  };
  modes();
  const target = node("select");
  target.setAttribute("aria-label", "統合先");
  rows()
    .filter((r) => r.id !== record.id)
    .forEach((r) => target.append(new Option(r.displayName || r.name, r.id)));
  const confirm = node("input");
  confirm.setAttribute("aria-label", "対象IDと名前の再確認");
  view.append(
    action,
    mode,
    target,
    node(
      "p",
      `実行時は「${record.id} ${record.displayName || record.name}」を入力してください。過去の参照やキャッシュは無断削除しません。`,
    ),
    confirm,
  );
  const data = () =>
    action.value === "visibility"
      ? mode.value
      : action.value === "wiki"
        ? mode.value === "include"
        : {
            action: action.value,
            id: record.id,
            targetId: action.value === "merge" ? target.value : null,
            collection: action.value === "collection" ? mode.value : null,
          };
  approval(view, data, (confirmation, reason) =>
    showPreview({
      sha: snapshot.sha,
      entity,
      action: action.value,
      id: record.id,
      ...(action.value === "merge" ? { targetId: target.value } : {}),
      ...(action.value === "collection" ? { collection: mode.value } : {}),
      ...(["visibility", "wiki"].includes(action.value)
        ? { value: data() }
        : {}),
      confirm: confirm.value,
      confirmation,
      reason,
    }),
  );
}
let previewNames = new Map();
function displayValue(value, path) {
  if (value === null || value === undefined || value === "")
    return "未登録・不明";
  if (typeof value === "boolean") return value ? "確認済み" : "未確認";
  if (Array.isArray(value))
    return value.length
      ? value.map((v) => displayValue(v, path)).join("、")
      : "登録なし";
  if (typeof value === "object")
    return (
      value.name ||
      value.displayName ||
      (value.url
        ? value.url
        : Object.entries(value)
            .map(
              ([k, v]) =>
                (contentLabels[k] || fieldLabel("/" + k)) +
                "：" +
                displayValue(v, "/" + k),
            )
            .join(" / "))
    );
  if (path.endsWith("organizationId"))
    return (
      snapshot.models.talents.organizations.find((o) => o.id === value)?.name ||
      "所属不明"
    );
  if (path.endsWith("talentIds"))
    return (
      snapshot.models.talents.talents.find((t) => t.id === value)
        ?.displayName || "未確認のメンバー"
    );
  if (typeof value === "string" && !path.endsWith("/id")) {
    const item = [
      ...snapshot.models.talents.talents,
      ...snapshot.models.talents.organizations,
      ...snapshot.models.catalog.groups,
      ...snapshot.models.music.songs,
      ...snapshot.models.media.videos,
      ...snapshot.models.goods.campaigns,
      ...snapshot.models.goods.products,
    ].find((r) => (r.id || r.youtubeId) === value);
    if (item) return item.displayName || item.name || item.title || value;
    if (previewNames.has(value)) return previewNames.get(value);
  }
  return enumLabels[value] || String(value);
}
async function showPreview(input, workspaceKey) {
  if (workspace && (input.action === "save" || input.entity === "content")) {
    await workspace.flush();
    const keys =
      input.entity === "content"
        ? input.value.operations
            .filter((o) => {
              if (workspace.operations.some((w) => w.key === o.key))
                return true;
              const t = schemas.content.types[o.entity],
                old =
                  o.id &&
                  snapshot.models[t.file][t.list].find(
                    (r) => r[t.field || "id"] === o.id,
                  );
              if (old && !fieldChanges(old, o.value).length) return false;
              throw new Error(
                "保存されていない変更があります。下書きを確認してください。",
              );
            })
            .map((o) => o.key)
        : [workspaceKey];
    if (
      !keys.length ||
      keys.some((k) => !k || !workspace.operations.some((o) => o.key === k))
    )
      throw new Error("変更がありません。下書きを確認してください。");
    const previous = activeEditor;
    submissionView({
      initialKeys: keys,
      initialReason: input.reason || "",
      autoPreview: true,
      onDone: () => {
        activeEditor = null;
        if (input.entity === "content") screen();
        else listView();
      },
      onBack: () => {
        if (input.entity === "content") {
          resumeOperationKey = keys[0];
          screen();
        } else {
          listView();
          masterPanel = detailPanel($("#view"), {
            title: labels[entity] + "編集",
            onClose: () => {
              masterTable?.refresh();
              return true;
            },
          });
          edit(
            rows().find((r) => r.id === input.id),
            workspace.operations.find((o) => o.key === workspaceKey),
          );
        }
      },
    });
    return;
  }

  // Phase 1 does not perform a rebase. Never submit a saved old record against a new main.
  const staged =
    workspace?.operations.filter((o) =>
      input.entity === "content"
        ? input.value.operations.some((v) => v.key === o.key)
        : o.entity === input.entity &&
          (workspaceKey
            ? o.key === workspaceKey
            : Boolean(input.id) && o.id === input.id),
    ) || [];
  if (staged.some((o) => o.baseCommit !== snapshot.sha))
    throw new Error(
      "保存後にmainが更新されています。下書きは保持しました。自動再適用はせず、最新データとの差分確認が必要です。",
    );
  showStatus("Schema・全参照を検証中…");
  const plan = await api("/api/change-requests/preview", "POST", input),
    view = $("#view");
  previewNames = new Map(
    (plan.impact.records || []).map((r) => [r.id, r.label]),
  );
  const group = input.entity === "group",
    collection = group
      ? "groups"
      : input.entity === "organization"
        ? "organizations"
        : "talents",
    file = group ? "catalog" : "talents";
  const diff = plan.diff.find((d) => d.file === file),
    before = diff?.before?.[collection]?.find((r) => r.id === input.id),
    after =
      diff?.after?.[collection]?.find((r) => r.id === input.id) ||
      diff?.after?.[collection]?.find(
        (r) => !diff.before[collection].some((b) => b.id === r.id),
      );
  view.replaceChildren(node("h2", "変更プレビュー"));
  const intro = node("section");
  intro.className = "review-intro";
  intro.append(
    node(
      "h3",
      after?.displayName || after?.name || before?.displayName || plan.title,
    ),
    node("p", "変更理由：" + input.reason),
  );
  view.append(intro);
  const comparison = node("section");
  comparison.className = "change-comparison";
  comparison.append(node("h3", "項目ごとの変更"));
  const comparisons =
    input.entity === "content"
      ? (plan.impact.records || []).map((record) => {
          const type = schemas.content.types[record.entity],
            d = plan.diff.find((d) => d.file === type.file),
            key = type.field || "id";
          return {
            label: record.label,
            before: d?.before?.[type.list]?.find((r) => r[key] === record.id),
            after: d?.after?.[type.list]?.find((r) => r[key] === record.id),
          };
        })
      : [{ before, after }];
  for (const record of comparisons) {
    if (record.label) comparison.append(node("h3", record.label));
    for (const c of fieldChanges(record.before, record.after)) {
      const row = node("article");
      row.className = "change-row";
      row.append(
        node(
          "h4",
          c.kind +
            "：" +
            c.path
              .split("/")
              .filter(Boolean)
              .map((k) => contentLabels[k] || fieldLabel("/" + k))
              .join(" / "),
        ),
      );
      const cells = node("div");
      cells.className = "comparison-grid";
      for (const [label, value] of [
        ["変更前", c.before],
        ["変更後", c.after],
      ]) {
        const cell = node("div");
        cell.append(node("strong", label));
        if (c.path === "/profileImage")
          cell.append(
            portrait(value?.url, label),
            node("p", value?.url || "画像未登録"),
          );
        else cell.append(node("p", displayValue(value, c.path)));
        cells.append(cell);
      }
      row.append(cells);
      comparison.append(row);
    }
  }
  if (!comparison.querySelector("article"))
    comparison.append(
      node(
        "p",
        "対象の管理状態・参照を変更します。詳しい差分を確認してください。",
      ),
    );
  view.append(comparison);
  const impact = node("details");
  impact.append(
    node(
      "summary",
      `参照影響：${plan.impact.references?.length || 0}件 / 収集・キャッシュ：${plan.impact.accountReferences?.length || 0}件`,
    ),
    node("p", plan.impact.note || ""),
    node("pre", JSON.stringify(plan.impact, null, 2)),
  );
  view.append(impact);
  const raw = node("details");
  raw.append(node("summary", "詳細データを確認"), node("pre", plan.summary));
  for (const c of plan.diff)
    raw.append(
      node("h4", c.file),
      node(
        "pre",
        JSON.stringify({ 変更前: c.before, 変更後: c.after }, null, 2),
      ),
    );
  view.append(raw);
  const returnList =
    input.entity === "content"
      ? () => {
          activeEditor = null;
          screen();
        }
      : listView;
  let submitted = false;
  const confirm = node("input");
  confirm.type = "checkbox";
  confirm.id = "preview-confirmed";
  const label = node("label");
  label.className = "review-confirm";
  label.append(
    confirm,
    document.createTextNode("差分と参照影響を確認しました"),
  );
  view.append(label);
  const submit = button("確認した変更でPRを作成", async () => {
    if (submitted || !confirm.checked || snapshot.migrationPending) return;
    submitted = true;
    submit.disabled = true;
    submit.textContent = "PRを作成中…";
    try {
      const result = await api("/api/change-requests", "POST", {
        previewId: plan.id,
      });
      if (workspace) {
        const submittedOps =
          input.entity === "content"
            ? input.value.operations
            : [
                {
                  entity: input.entity,
                  id: input.id,
                  key: workspaceKey,
                  value: input.value,
                },
              ];
        workspace.replace(withoutSubmitted(workspace.operations, submittedOps));
        workspace
          .save()
          .catch((e) =>
            showStatus("PRは作成済みですが、下書き整理の保存に失敗しました。"),
          );
      }
      activeEditor = null;
      renderOutcome(view, {
        number: result.number,
        url: result.url,
        onSubmitted: () => {
          location.hash = "#submitted";
        },
        onBack: returnList,
      });
      showStatus("PR作成成功");
    } catch (e) {
      submitted = false;
      submit.disabled = false;
      submit.textContent = "確認した変更でPRを作成";
      throw e;
    }
  });
  submit.disabled = true;
  confirm.onchange = () =>
    (submit.disabled =
      !confirm.checked || submitted || snapshot.migrationPending);
  view.append(
    submit,
    button("編集に戻る（再プレビューが必要）", () => {
      if (activeEditor) activeEditor.show();
      else returnList();
    }),
  );
  showStatus(
    snapshot.migrationPending
      ? "データ移行中です。プレビューできますが、PR作成は移行後に再読み込みしてください。"
      : "プレビュー済み。まだGitHubへ書き込んでいません。",
  );
  view.querySelector("h2").tabIndex = -1;
  view.querySelector("h2").focus();
}
async function memberSettings() {
  const panel = node("section");
  panel.className = "stack";
  $("#view").append(panel);
  panel.append(node("h3", "編集者と招待"));
  const form = node("form");
  form.className = "stack";
  const email = node("input");
  email.type = "email";
  email.required = true;
  email.maxLength = 254;
  const emailLabel = node("label", "Googleのメールアドレス");
  emailLabel.append(email);
  const roleLabel = node("label", "権限");
  const role = node("select");
  role.append(new Option("編集者", "editor"), new Option("閲覧者", "viewer"));
  roleLabel.append(role);
  const disabled = node("input");
  disabled.type = "checkbox";
  const disabledLabel = node("label", "招待を取り消す・アカウントを無効化する");
  disabledLabel.prepend(disabled);
  const directPublish = node("input");
  directPublish.type = "checkbox";
  const publishLabel = node("label", "直接公開の権限を付与する（公開機能の導入後に適用）");
  publishLabel.prepend(directPublish);
  function scopeChoices(title, options) {
    const group = node("fieldset");
    group.append(node("legend", title));
    const inputs = new Map(options.map(([value, label]) => {
      const input = node("input");
      input.type = "checkbox";
      const field = node("label", label);
      field.prepend(input);
      group.append(field);
      return [value, input];
    }));
    return {
      group,
      read: () => [...inputs].filter(([, input]) => input.checked).map(([value]) => value),
      fill: (values) => { for (const [value, input] of inputs) input.checked = values?.includes(value) ?? false; },
    };
  }
  let scopeControls;
  let selectedMember = null;
  const migration = node("input");
  migration.type = "checkbox";
  const migrationLabel = node("label", "既存の担当範囲を保持したまま、全コンテンツの編集・公開を許可する共通ポリシーへ切り替える");
  migrationLabel.prepend(migration);
  migrationLabel.hidden = true;
  const legacyOptions = node("details");
  legacyOptions.hidden = true;
  legacyOptions.append(node("summary", "既存の担当範囲"));
  legacyOptions.append(publishLabel);
  const reset = node("button", "新しい招待");
  reset.type = "button";
  const resetInvitation = () => {
    selectedMember = null;
    email.value = "";
    email.readOnly = false;
    role.value = "editor";
    disabled.checked = false;
    migration.checked = false;
    migrationLabel.hidden = true;
    legacyOptions.hidden = true;
    email.focus();
  };
  reset.onclick = resetInvitation;
  const submit = node("button", "招待・権限を保存");
  const status = node("p");
  status.setAttribute("role", "status");
  const list = node("ul");
  form.append(emailLabel, roleLabel, disabledLabel, migrationLabel, legacyOptions, submit, reset);
  submit.disabled = true;
  const bulk = node("button", "既存ユーザーを共通権限へ移行");
  bulk.type = "button";
  bulk.className = "primary";
  bulk.hidden = true;
  panel.append(form, bulk, status, list);
  async function refresh() {
    const { members } = await api("/api/members");
    const eligible = members.filter((member) => member.contentPolicy !== "all-content-v1" &&
      !member.disabled && (member.accepted || member.expires > Date.now()));
    bulk.hidden = eligible.length === 0;
    bulk.textContent = "既存ユーザー " + eligible.length + " 人を共通権限へ移行";
    bulk.onclick = async () => {
      const editors = eligible.filter((member) => member.role === "editor").length;
      const viewers = eligible.length - editors;
      if (!confirm("編集者 " + editors + " 人に全コンテンツの編集・直接公開権限を付与し、閲覧者 " + viewers +
        " 人に全コンテンツの閲覧を許可します。無効・期限切れの招待は対象外です。既存の担当範囲は保持し、対象のログインセッションは失効します。続けますか？")) return;
      bulk.disabled = true;
      try {
        const result = await api("/api/members/migrate", "POST", {
          confirmPolicyMigration: true,
          members: eligible.map(({ id, role }) => ({ id, role })),
        });
        status.textContent = result.migrated + " 人を共通権限へ移行しました。";
        await refresh();
        resetInvitation();
      } catch (error) {
        status.textContent = error.message === "cms_publication_busy"
          ? "公開処理中のユーザーがいます。完了後に移行してください。"
          : "移行できませんでした。最新のユーザー一覧を確認してください。";
        await refresh().catch(() => {});
      } finally { bulk.disabled = false; }
    };
    list.replaceChildren(...members.map((member) => {
      const row = node("li");
      const state = member.disabled ? "無効" : member.accepted ? "登録済み" :
        member.expires <= Date.now() ? "招待期限切れ" : "招待中";
      const edit = node("button", member.email || member.id);
      edit.type = "button";
      edit.onclick = () => {
        selectedMember = member;
        migration.checked = false;
        const legacy = member.contentPolicy !== "all-content-v1";
        migrationLabel.hidden = !legacy;
        legacyOptions.hidden = !legacy;
        email.value = member.email || "";
        email.readOnly = true;
        role.value = member.role;
        disabled.checked = member.disabled;
        directPublish.checked = member.directPublish;
        for (const [key, control] of Object.entries(scopeControls)) control.fill(member.scope?.[key]);
        email.focus();
      };
      row.append(edit, node("span", " " + state + "・" + (member.role === "editor" ? "編集者" : "閲覧者") +
        "・" + (member.contentPolicy === "all-content-v1" ? "全コンテンツ" : "旧担当範囲")));
      return row;
    }));
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await api("/api/members", "POST", {
        email: email.value, role: role.value, disabled: disabled.checked,
        contentPolicy: !selectedMember || selectedMember.contentPolicy === "all-content-v1" || migration.checked ? "all-content-v1" : "scoped-v1",
        confirmPolicyMigration: Boolean(selectedMember && migration.checked),
        ...(selectedMember && !migration.checked && selectedMember.contentPolicy !== "all-content-v1" ? {
          directPublish: directPublish.checked,
          scope: Object.fromEntries(Object.entries(scopeControls).map(([key, control]) => [key, control.read()])),
        } : {}),
      });
      status.textContent = "保存しました。対象アカウントの既存セッションは失効します。";
      await refresh();
      resetInvitation();
    } catch {
      status.textContent = "招待または権限の更新を完了できませんでした。";
    } finally {
      submit.disabled = false;
    }
  };
  try {
    const { models } = await api("/api/masters");
    scopeControls = {
      organizations: scopeChoices("担当事務所", models.talents.organizations.map(({ id, name }) => [id, name])),
      groups: scopeChoices("担当グループ", models.catalog.groups.filter((group) => group.visibility === "public").map(({ id, name }) => [id, name])),
      categories: scopeChoices("担当カテゴリ", [
        ["talents", "VTuber"], ["anniversaries", "記念日"], ["events", "イベント"],
        ["music", "音楽・歌枠"], ["goods", "グッズ"],
      ]),
    };
    for (const control of Object.values(scopeControls)) legacyOptions.append(control.group);
    await refresh();
    submit.disabled = false;
  } catch {
    status.textContent = "編集者一覧または担当範囲を取得できませんでした。";
  }
}
const oldScreen = screen;
screen = function () {
  if (!me) return;
  $("#view").className = "";
  const route = location.hash || "#dashboard";
  $("#page-title").textContent =
    {
      "#dashboard": "ダッシュボード",
      "#masters": "VTuber",
      "#organizations": "事務所・グループ",
      "#anniversaries": "記念日",
      "#music": "音楽",
      "#events": "イベント",
      "#goods": "グッズ",
      "#workspace": "変更内容",
      "#submitted": "提出済みPR",
      "#settings": "設定",
    }[route] || "管理";
  for (const a of document.querySelectorAll("nav a")) {
    if (a.hash === (location.hash || "#dashboard")) {
      a.setAttribute("aria-current", "page");
      const group = a.closest("details");
      if (group && !group.hidden) group.open = true;
    } else a.removeAttribute("aria-current");
  }
  const compatibility = { "#masters": "talent", "#anniversaries": "anniversary", "#events": "event", "#music": "song", "#goods": "product", "#organizations": "organization" };
  const contentEntity = route.startsWith("#content/") ? route.slice(9) : me.provider === "google" ? compatibility[route] : null;
  const cmsPages = { "#dashboard": "dashboard", "#cms": "dashboard", "#drafts": "drafts", "#publication": "publication", "#history": "history", "#search": "search", ...(me.provider === "google" ? { "#workspace": "drafts" } : {}) };
  if (me.simpleCms && (contentEntity || cmsPages[route])) {
    const pageNames = { dashboard: "ダッシュボード", drafts: "下書き", publication: "公開状況", history: "更新履歴", search: "全体検索" };
    const names = { talent: "VTuber", organization: "事務所", group: "グループ", anniversary: "記念日", event: "イベント", song: "楽曲", musicVideo: "歌動画", video: "動画情報", karaoke: "歌枠", performance: "歌唱記録", product: "商品", campaign: "キャンペーン", offer: "販売情報" };
    const title = contentEntity ? names[contentEntity] : pageNames[cmsPages[route]];
    $("#page-title").textContent = title || "コンテンツ";
    const panel = node("section");
    panel.className = "cms-content stack";
    const status = node("p", "読み込み中…");
    status.setAttribute("role", "status");
    panel.append(node("h2", title || "コンテンツ"), status);
    if (me.provider !== "google" && ["drafts", "publication"].includes(cmsPages[route])) {
      const review = node("a", "下書きを確認して公開申請");
      review.href = "#workspace";
      review.className = "button";
      panel.append(review);
    }
    $("#view").replaceChildren(panel);
    import("./simple-cms.js").then(({ mountSimpleCms }) => mountSimpleCms(panel, status, api, { entity: contentEntity, view: cmsPages[route] || "content" }))
      .catch(() => {
        status.textContent = "コンテンツを取得できませんでした。";
        const retry = node("button", "再試行");
        retry.onclick = () => screen();
        panel.append(retry);
      });
    return;
  }
  if (me.provider === "google") {
    $("#view").replaceChildren(node("h2", "この画面は利用できません"), node("p", "サイドバーからコンテンツを選んでください。"));
    return;
  }
  if (route === "#settings") {
    oldScreen();
    void memberSettings();
    return;
  }
  if (location.hash === "#submitted") {
    const open = () => submissionView({ mode: "submitted" });
    if (snapshot) open();
    else loadMasters(open).catch((e) => showStatus(e.message));
    return;
  }
  if (location.hash === "#workspace") {
    if (snapshot) workspaceView();
    else loadMasters(workspaceView).catch((e) => showStatus(e.message));
    return;
  }
  if (
    ["#anniversaries", "#music", "#events", "#goods"].includes(location.hash)
  ) {
    const open = () => {
      activeEditor = mountContent({
        container: $("#view"),
        category: location.hash.slice(1),
        baseCommit: snapshot.sha,
        resumeKey: resumeOperationKey,
        getWorkspaceOperations: () => workspace.operations,
        workspaceOperations: workspace?.operations || [],
        onWorkspaceChange: (operations) =>
          workspace?.replace([
            ...workspace.operations.filter(
              (o) => !schemas.content.types[o.entity],
            ),
            ...operations,
          ]),
        models: snapshot.models,
        referenceModels: referenceModels(snapshot.models, workspace.operations),
        forms: schemas.content,
        onReload: () => loadMasters(open),
        onPreview: async (value, reason) =>
          showPreview({
            sha: snapshot.sha,
            entity: "content",
            action: "batch",
            value,
            reason,
            confirmation: {
              status: "confirmed",
              valueHash: await digest(value),
            },
          }),
      });
      resumeOperationKey = undefined;
    };
    if (snapshot) open();
    else loadMasters(open).catch((e) => showStatus(e.message));
  } else if (["#masters", "#organizations"].includes(location.hash)) {
    entity = location.hash === "#organizations" ? "organization" : "talent";
    if (snapshot) listView();
    else loadMasters().catch((e) => showStatus(e.message));
  } else {
    oldScreen();
    if (!location.hash || location.hash === "#dashboard") {
      const cards = node("div");
      cards.className = "content-dashboard";
      for (const [route, name] of [
        ["masters", "VTuber"],
        ["anniversaries", "記念日"],
        ["music", "音楽"],
        ["events", "イベント"],
        ["goods", "グッズ"],
      ])
        cards.append(
          button(name + "管理", () => (location.hash = "#" + route)),
        );
      $("#view").append(cards);
    }
  }
};
if (me && location.hash === "#masters")
  loadMasters().catch((e) => showStatus(e.message));

window.addEventListener("keydown", (e) => {
  if (
    !(e.ctrlKey || e.metaKey) ||
    e.altKey ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    activeEditor?.pending ||
    document.querySelector("dialog[open]")
  )
    return;
  if (e.key.toLowerCase() === "k" && me?.simpleCms) {
    e.preventDefault();
    if (location.hash === "#search") document.querySelector("#view input[type=search]")?.focus();
    else location.hash = "#search";
    return;
  }
  if (e.key.toLowerCase() === "z" && workspace) {
    e.preventDefault();
    workspace.history(e.shiftKey ? "redo" : "undo");
    if (activeEditor?.refresh) activeEditor.refresh();
    else screen();
  }
});
