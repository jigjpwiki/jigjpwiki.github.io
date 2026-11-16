import { createEditor } from "./editor.js";
import { fieldChanges, fieldLabel } from "./draft.js";
import { portrait } from "./controls.js";
const $ = (s) => document.querySelector(s);
let me;
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
  if (!r.ok)
    throw new Error(
      {
        admin_updated_reload:
          "管理画面が更新されました。再読み込みしてください。",
        migration_pending_reload:
          "データ移行中です。移行完了後に再読み込みしてプレビューし直してください。",
        main_changed_reload:
          "mainが更新されました。最新mainを再読み込みし、変更を再確認してください。",
        references_prevent_deletion:
          "関連データまたは収集・キャッシュの参照が残るため削除できません。",
        references_prevent_hiding_review_history_first:
          "公開済みの参照が残っています。履歴を維持する対応方針を先にレビューしてください。",
        official_profile_identity_already_registered:
          "同じ公式プロフィールのIDが登録済みです。重複と改名を確認してください。",
        field_confirmation_required: "変更内容をもう一度確認してください。",
        confirmation_name_and_id_required:
          "対象IDと表示名を正確に入力してください。",
      }[data.error] ||
        data.error ||
        "通信に失敗しました",
    );
  return data;
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
    if (a.hash === (location.hash || "#dashboard"))
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const settings = location.hash === "#settings";
  $("#view").replaceChildren(
    node("h2", settings ? "設定" : "管理トップ"),
    node(
      "p",
      settings
        ? "認証と数値ユーザーIDの許可リストはサーバーで管理します。Secretsの表示・変更機能はありません。"
        : "GitHubのJSONが正本です。変更は確認後にPRとして提出し、人間がマージします。",
    ),
  );
}
let acceptedHash = location.hash;
window.addEventListener("hashchange", () => {
  if (activeEditor?.dirty && !mayLeave()) {
    history.replaceState(null, "", acceptedHash || "#masters");
    return;
  }
  activeEditor = null;
  acceptedHash = location.hash;
  screen();
});
async function start() {
  try {
    me = await api("/api/me");
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#identity").textContent = `${me.login} / 管理者 / ${me.repository}`;
    $("#logout").onclick = async () => {
      if (!mayLeave()) return;
      activeEditor = null;
      await api("/auth/logout", "POST", {});
      location.reload();
    };
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
async function loadMasters() {
  referenceIndex = undefined;
  showStatus("最新mainを読み込み中…");
  [snapshot, schemas] = await Promise.all([
    api("/api/masters"),
    api("/api/forms"),
  ]);
  showStatus("最新main: " + snapshot.sha.slice(0, 10));
  listView();
}
function listView() {
  const view = $("#view");
  view.replaceChildren(node("h2", labels[entity] + "管理"));
  const menu = node("div");
  for (const type of Object.keys(initial))
    menu.append(
      button(labels[type], () => {
        entity = type;
        page = 0;
        listView();
      }),
    );
  view.append(
    menu,
    button("新規登録", () => edit()),
    button("最新mainを再読み込み", loadMasters),
  );
  const filters = node("div");
  filters.className = "grid";
  const query = node("input");
  query.type = "search";
  query.setAttribute("aria-label", "名前・IDで検索");
  query.placeholder = "名前・IDで検索";
  const org = node("select");
  org.setAttribute("aria-label", "事務所で絞り込み");
  org.append(new Option("すべての事務所", ""));
  snapshot.models.talents.organizations.forEach((o) =>
    org.append(new Option(o.name, o.id)),
  );
  const group = node("select");
  group.setAttribute("aria-label", "グループで絞り込み");
  group.append(new Option("すべてのグループ", ""));
  snapshot.models.catalog.groups.forEach((g) =>
    group.append(new Option(g.name, g.id)),
  );
  const activity = node("select");
  activity.setAttribute("aria-label", "活動状態");
  ["", "unknown", "active", "hiatus", "ended", "retired"].forEach((s) =>
    activity.append(new Option(s || "すべての活動状態", s)),
  );
  const youtube = node("select");
  youtube.setAttribute("aria-label", "YouTube登録");
  youtube.append(
    new Option("YouTube：すべて", ""),
    new Option("ID登録あり", "yes"),
    new Option("未登録・不明", "no"),
  );
  const wiki = node("select");
  wiki.setAttribute("aria-label", "Wiki登録");
  wiki.append(
    new Option("Wiki：すべて", ""),
    new Option("登録あり", "yes"),
    new Option("登録なし", "no"),
  );
  const missing = node("select");
  missing.setAttribute("aria-label", "情報不足");
  missing.append(
    new Option("情報の充足：すべて", ""),
    new Option("未確認・未登録項目あり", "yes"),
  );
  const agency = node("select");
  agency.setAttribute("aria-label", "所属状態");
  agency.append(new Option("所属状態：すべて", ""));
  schemas.definitions.agencyState.properties.value.enum.forEach((v) =>
    agency.append(new Option(enumLabels[v] || v, v)),
  );
  filters.append(query, org, group, activity, youtube, wiki, agency, missing);
  view.append(filters);
  const count = node("p"),
    result = node("div"),
    pager = node("div");
  view.append(count, result, pager);
  const render = () => {
    let list = rows().filter((r) =>
      [r.id, r.displayName || r.name, ...(r.aliases || []).map((a) => a.name)]
        .join(" ")
        .normalize("NFKC")
        .toLowerCase()
        .includes(query.value.normalize("NFKC").toLowerCase()),
    );
    if (entity === "talent") {
      list = list.filter(
        (t) =>
          (!org.value ||
            t.affiliations.some((a) => a.organizationId === org.value)) &&
          (!group.value ||
            snapshot.models.catalog.groups
              .find((g) => g.id === group.value)
              ?.talentIds.includes(t.id)) &&
          (!activity.value || t.activityStatus.value === activity.value) &&
          (!youtube.value ||
            t.accounts.some((a) => a.service === "youtube" && a.accountId) ===
              (youtube.value === "yes")) &&
          (!wiki.value || !!t.wiki === (wiki.value === "yes")) &&
          (!agency.value || t.agencyStatus.value === agency.value) &&
          (!missing.value ||
            !t.wiki ||
            !t.profileImage ||
            t.activityStatus.value === "unknown" ||
            !t.accounts.some((a) => a.service === "youtube" && a.accountId)),
      );
    }
    count.textContent = `${list.length}件 / 全${rows().length}件`;
    const table = node("table");
    const thead = node("thead"),
      tr = node("tr");
    ["名前", "所属・状態", "関連情報"].forEach((s) => tr.append(node("th", s)));
    thead.append(tr);
    table.append(thead);
    const tbody = node("tbody");
    for (const r of list.slice(page * 30, page * 30 + 30)) {
      const row = node("tr"),
        name = node("td");
      name.append(
        portrait(r.profileImage?.url, r.displayName || r.name),
        button(r.displayName || r.name, () => detail(r)),
      );
      const affiliations =
        r.affiliations
          ?.map(
            (a) =>
              (a.status === "former" ? "旧所属：" : "") +
              (snapshot.models.talents.organizations.find(
                (o) => o.id === a.organizationId,
              )?.name || "所属不明"),
          )
          .join("・") || "所属未登録";
      row.append(
        name,
        node(
          "td",
          entity === "talent"
            ? affiliations +
                " / " +
                ({
                  unknown: "活動状態不明",
                  active: "活動中",
                  hiatus: "活動休止",
                  retired: "引退（確認済み）",
                  retired: "引退（確認済み）",
                  ended: "活動終了",
                }[r.activityStatus.value] || r.activityStatus.value) +
                " / " +
                (r.visibility || "public")
            : r.name,
        ),
        node("td", related(r.id).length + "参照"),
      );
      tbody.append(row);
    }
    table.append(tbody);
    result.replaceChildren(
      list.length
        ? table
        : node("p", "該当する登録がありません。条件を解除してください。"),
    );
    pager.replaceChildren(
      button("前へ", () => {
        page = Math.max(0, page - 1);
        render();
      }),
      node("span", page + 1 + "ページ"),
      button("次へ", () => {
        if ((page + 1) * 30 < list.length) page++;
        render();
      }),
    );
  };
  for (const input of filters.children)
    input.oninput = () => {
      page = 0;
      render();
    };
  view.append(
    button("条件を解除", () => {
      for (const input of filters.children) input.value = "";
      page = 0;
      render();
    }),
  );
  render();
}
function detail(record) {
  const view = $("#view");
  view.replaceChildren(
    button("一覧へ戻る", listView),
    node("h2", record.displayName || record.name),
    node("p", record.id),
    button("編集", () => edit(record)),
  );
  const refs = [...related(record.id), ...accountReferences(record)];
  view.append(
    node(
      "p",
      "掲載: " +
        (record.visibility || "public") +
        " / 管理レコード保持: はい / Wiki管理対象: " +
        (snapshot.models["admin-ledger"].wikiExclusions.includes(record.id)
          ? "除外"
          : "対象") +
        " / 収集・キャッシュ参照: " +
        accountReferences(record).length +
        "件",
    ),
  );
  view.append(
    node("h3", "関連情報・削除前の影響"),
    node("pre", refs.join("\n") || "ID参照なし"),
  );
  if (record.accounts)
    for (const a of record.accounts)
      view.append(link(a.service + ": " + (a.accountId || "ID未確認"), a.url));
  if (record.wiki) view.append(link("非公式Wiki", record.wiki.url));
  const history = snapshot.models["admin-ledger"].entries.filter(
    (e) => e.subject === record.id,
  );
  view.append(
    link(
      "GitHubで過去の変更履歴を確認",
      "https://github.com/jigjpwiki/jigjpwiki.github.io/commits/main/data/" +
        (entity === "group" ? "catalog" : "talents") +
        ".json",
    ),
  );
  view.append(
    node("h3", "管理変更履歴"),
    node(
      "pre",
      history
        .map((h) => h.at + " / " + h.action + " / " + h.reason)
        .join("\n") ||
        "管理画面経由の変更履歴なし（既存データはGit履歴で確認）",
    ),
  );
  view.append(button("非公開化・統合・削除・対象変更", () => manage(record)));
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
  if (activeEditor?.pending) {
    showStatus("検証が終わるまでお待ちください。");
    return false;
  }
  return (
    !activeEditor?.dirty ||
    window.confirm("未保存の変更があります。破棄して移動しますか？")
  );
}
window.addEventListener("beforeunload", (e) => {
  if (activeEditor?.dirty) {
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
function edit(record) {
  showStatus("編集中の変更は、PR作成までGitHubへ保存されません。");
  const view = $("#view");
  const open = () => {
    activeEditor = createEditor({
      container: view,
      entity,
      record,
      initial: initial[entity],
      models: snapshot.models,
      schemas,
      onCancel: () => {
        if (mayLeave()) {
          activeEditor = null;
          listView();
        }
      },
      onSelectRecord: (id) => {
        if (mayLeave()) {
          const other = rows().find((r) => r.id === id);
          if (other) edit(other);
        }
      },
      onPreview: async ({ value, reason }) =>
        showPreview({
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
        }),
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
    ["visibility", "公開対象の変更"],
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
              ([k, v]) => fieldLabel("/" + k) + "：" + displayValue(v, "/" + k),
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
  return enumLabels[value] || String(value);
}
async function showPreview(input) {
  showStatus("Schema・全参照を検証中…");
  const plan = await api("/api/change-requests/preview", "POST", input),
    view = $("#view");
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
  for (const c of fieldChanges(before, after)) {
    const row = node("article");
    row.className = "change-row";
    row.append(node("h4", c.kind + "：" + fieldLabel(c.path)));
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
      activeEditor = null;
      view.replaceChildren(
        node("h2", "PRを作成しました"),
        link("GitHubでPR #" + result.number + "を確認", result.url),
        node("p", "差分とCIを人間が確認してマージしてください。"),
        button("一覧へ戻る", listView),
      );
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
      else listView();
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
const oldScreen = screen;
screen = function () {
  if (!me) return;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.hash === (location.hash || "#dashboard"))
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (location.hash === "#masters") {
    if (snapshot) listView();
    else loadMasters().catch((e) => showStatus(e.message));
  } else oldScreen();
};
if (me && location.hash === "#masters")
  loadMasters().catch((e) => showStatus(e.message));
