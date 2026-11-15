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
        main_changed_reload:
          "mainが更新されました。最新mainを再読み込みし、変更を再確認してください。",
        references_prevent_deletion:
          "関連データまたは収集・キャッシュの参照が残るため削除できません。",
        references_prevent_hiding_review_history_first:
          "公開済みの参照が残っています。履歴を維持する対応方針を先にレビューしてください。",
        official_profile_identity_already_registered:
          "同じ公式プロフィールのIDが登録済みです。重複と改名を確認してください。",
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
window.addEventListener("hashchange", () => screen());
async function start() {
  try {
    me = await api("/api/me");
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#identity").textContent = `${me.login} / 管理者 / ${me.repository}`;
    $("#logout").onclick = async () => {
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
  sourceRefs: "出典ID",
  displayNameSourceRefs: "名前の出典ID",
  wiki: "非公式Wiki",
  profileImage: "プロフィール画像",
  talentIds: "メンバーID",
  membersComplete: "メンバー一覧確認済み",
  visibility: "公開状態",
  id: "固定内部ID",
  kind: "出典の種類",
  checkedAt: "確認日時（UTC）",
};
const enumLabels = {
  unknown: "不明",
  public: "公開",
  draft: "非公開",
  current: "現在の所属",
  former: "旧所属",
  active: "活動中",
  hiatus: "活動休止",
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
    displayNameSourceRefs: [],
    aliases: [],
    affiliations: [],
    agencyStatus: { value: "unknown", sourceRefs: [] },
    activityStatus: { value: "unknown", sourceRefs: [] },
    accounts: [],
    wiki: null,
    profileImage: null,
    visibility: "public",
  },
  organization: { name: "", sourceRefs: [] },
  group: {
    name: "",
    organizationId: null,
    talentIds: [],
    membersComplete: false,
    sourceRefs: [],
    visibility: "draft",
  },
};
const rows = () =>
  entity === "talent"
    ? snapshot.models.talents.talents
    : entity === "organization"
      ? snapshot.models.talents.organizations
      : snapshot.models.catalog.groups;
const allSources = () => [
  ...snapshot.models.talents.sources,
  ...snapshot.models.catalog.sources,
];
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
const sourcesView = (refs) => {
  const d = node("details"),
    summary = node("summary", "出典・確認日時");
  d.append(summary);
  for (const id of refs) {
    const s = allSources().find((s) => s.id === id);
    d.append(
      s ? link(`${id} / ${s.kind} / ${s.checkedAt}`, s.url) : node("p", id),
    );
  }
  return d;
};
function resolve(shape) {
  if (shape.$ref)
    return resolve(schemas.definitions[shape.$ref.split("/").pop()]);
  return shape;
}
function empty(shape) {
  shape = resolve(shape);
  if (shape.anyOf) return empty(shape.anyOf.find((s) => s.type !== "null"));
  if (shape.enum) return shape.enum[0];
  if (shape.type === "array") return [];
  if (shape.type === "object")
    return Object.fromEntries(
      Object.entries(shape.properties)
        .filter(([k]) => k !== "id")
        .map(([k, s]) => [k, empty(s)]),
    );
  if (shape.type === "boolean") return false;
  if (shape.type === "number" || shape.type === "integer") return 0;
  return "";
}
function field(shape, value, set, key = "value", changed = () => {}) {
  shape = resolve(shape);
  const wrap = node("fieldset");
  wrap.append(node("legend", labels[key] || key));
  if (shape.anyOf) {
    const option = shape.anyOf.find((s) => s.type !== "null"),
      nullable = shape.anyOf.some((s) => s.type === "null");
    if (nullable) {
      const label = node("label"),
        toggle = node("input");
      toggle.type = "checkbox";
      toggle.checked = value === null;
      label.append(toggle, document.createTextNode("不明・未登録（null）"));
      wrap.append(label);
      toggle.onchange = () => {
        set(toggle.checked ? null : empty(option));
        changed();
      };
      if (value === null) return wrap;
    }
    wrap.append(field(option, value, set, key, changed));
    return wrap;
  }
  if (shape.type === "object") {
    const object = value || {};
    for (const [k, s] of Object.entries(shape.properties || {})) {
      if (!(k in object) && !(shape.required || []).includes(k)) continue;
      wrap.append(
        field(
          s,
          object[k],
          (v) => {
            object[k] = v;
            set(object);
          },
          k,
          changed,
        ),
      );
    }
    return wrap;
  }
  if (shape.type === "array") {
    const list = value || [];
    list.forEach((v, i) => {
      const item = node("div");
      item.append(
        field(
          shape.items,
          v,
          (x) => {
            list[i] = x;
            set(list);
          },
          key,
          changed,
        ),
        button("この項目を削除", () => {
          list.splice(i, 1);
          set(list);
          changed();
        }),
      );
      wrap.append(item);
    });
    wrap.append(
      button("項目を追加", () => {
        list.push(empty(shape.items));
        set(list);
        changed();
      }),
    );
    if (key === "sourceRefs" || key === "displayNameSourceRefs")
      wrap.append(sourcesView(list));
    return wrap;
  }
  const label = node("label", labels[key] || key);
  const input = node(shape.enum ? "select" : "input");
  input.setAttribute("aria-label", labels[key] || key);
  if (shape.enum) {
    for (const value of shape.enum) {
      const option = node("option", enumLabels[value] || String(value));
      option.value = String(value);
      input.append(option);
    }
    input.value = String(value ?? shape.enum[0]);
  } else if (shape.type === "boolean") {
    input.type = "checkbox";
    input.checked = !!value;
  } else {
    input.type =
      shape.type === "number" || shape.type === "integer" ? "number" : "text";
    input.value = value ?? "";
    if (["sourceRefs", "displayNameSourceRefs"].includes(key))
      input.setAttribute("list", "source-ids");
    if (key === "id") input.readOnly = true;
  }
  input.onchange = () => {
    set(
      shape.type === "boolean"
        ? input.checked
        : shape.type === "number" || shape.type === "integer"
          ? Number(input.value)
          : input.value,
    );
    changed(false);
  };
  label.append(input);
  wrap.append(label);
  return wrap;
}
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
    ["ID・名前", "所属・状態", "関連情報"].forEach((s) =>
      tr.append(node("th", s)),
    );
    thead.append(tr);
    table.append(thead);
    const tbody = node("tbody");
    for (const r of list.slice(page * 30, page * 30 + 30)) {
      const row = node("tr"),
        name = node("td");
      if (r.profileImage?.url?.startsWith("https:")) {
        const image = node("img");
        image.src = r.profileImage.url;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.onerror = () => image.remove();
        name.append(image);
      }
      name.append(
        node("p", r.id),
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
                r.activityStatus.value +
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
    sourcesView(record.displayNameSourceRefs || record.sourceRefs || []),
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
function approval(form, value, onPreview, extraSources = []) {
  const reason = node("textarea");
  reason.setAttribute("aria-label", "変更理由");
  form.append(node("label", "変更理由"), reason);
  const source = node("select");
  source.setAttribute("aria-label", "確認した公式出典");
  for (const s of [...allSources(), ...extraSources].filter(
    (s) => s.kind === "official",
  ))
    source.append(new Option(s.url, s.url));
  const checked = node("input");
  checked.type = "checkbox";
  checked.id = "evidence-confirmed";
  const label = node("label");
  label.append(
    checked,
    document.createTextNode(
      "変更する値と公式出典を確認しました（値変更時は再確認）",
    ),
  );
  form.append(
    source,
    label,
    button("変更プレビュー", async () => {
      if (!checked.checked)
        throw new Error("公式出典と変更内容の確認が必要です");
      await onPreview(
        {
          status: "verified",
          url: source.value,
          checkedAt: new Date().toISOString(),
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
function edit(record) {
  let value = structuredClone(record || initial[entity]),
    sources = [];
  const view = $("#view");
  const draw = () => {
    const savedReason =
      view.querySelector('textarea[aria-label="変更理由"]')?.value || "";
    view.replaceChildren(
      button("一覧へ戻る", listView),
      node("h2", labels[entity] + (record ? "編集" : "新規登録")),
    );
    const editor = field(
      schemas[entity],
      value,
      (v) => (value = v),
      "value",
      (redraw) => {
        const check = $("#evidence-confirmed");
        if (check) check.checked = false;
        if (redraw !== false) draw();
      },
    );
    view.append(editor);
    const ids = node("datalist");
    ids.id = "source-ids";
    for (const s of [...allSources(), ...sources]) {
      const o = node("option");
      o.value = s.id;
      o.label = s.url;
      ids.append(o);
    }
    view.append(ids);
    view.append(node("h3", "新しい出典（既存IDは上書きしません）"));
    const sourceUrl = node("input");
    sourceUrl.type = "url";
    sourceUrl.setAttribute("aria-label", "追加する公式URL");
    const sourceKind = node("select");
    sourceKind.setAttribute("aria-label", "追加する出典の種類");
    sourceKind.append(
      new Option("公式", "official"),
      new Option("非公式Wiki", "wiki"),
    );
    view.append(
      sourceUrl,
      sourceKind,
      button("出典を追加", async () => {
        const u = new URL(sourceUrl.value);
        if (u.protocol !== "https:")
          throw new Error("HTTPSの公式URLを指定してください");
        const s = {
          id:
            "src-admin-" +
            (await digest(u.href))
              .slice(0, 16)
              .toLowerCase()
              .replace(/_/g, "a"),
          kind: sourceKind.value,
          url: u.href,
          checkedAt: new Date().toISOString(),
        };
        sources.push(s);
        if (!record && entity === "talent" && s.kind === "official") {
          value.displayNameSourceRefs = [s.id];
          if (["youtube.com", "www.youtube.com"].includes(u.hostname)) {
            const channel =
              u.pathname.match(/^\/channel\/(UC[\w-]{22})$/)?.[1] || null;
            if (channel || /^\/@[^/]+$/.test(u.pathname))
              value.accounts.push({
                service: "youtube",
                accountId: channel,
                url: u.href,
                sourceRefs: [s.id],
              });
          }
        }
        draw();
      }),
    );
    sources.forEach((s) => view.append(link(s.id, s.url)));
    approval(
      view,
      () => value,
      async (evidence, reason) =>
        showPreview({
          sha: snapshot.sha,
          entity,
          action: "save",
          ...(record ? { id: record.id } : {}),
          value,
          sources,
          evidence,
          reason,
        }),
      sources,
    );
    view.querySelector('textarea[aria-label="変更理由"]').value = savedReason;
  };
  draw();
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
    const c = $("#evidence-confirmed");
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
  approval(view, data, (evidence, reason) =>
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
      evidence,
      reason,
    }),
  );
}
async function showPreview(input) {
  showStatus("Schema・全参照を検証中…");
  const plan = await api("/api/change-requests/preview", "POST", input);
  const view = $("#view");
  view.replaceChildren(
    node("h2", "変更プレビュー"),
    node("p", plan.title),
    node("pre", plan.summary),
    node("h3", "影響"),
    node("pre", JSON.stringify(plan.impact, null, 2)),
  );
  for (const change of plan.diff) {
    const section = node("details");
    section.append(
      node("summary", change.file),
      node("h3", "変更前"),
      node("pre", JSON.stringify(change.before, null, 2)),
      node("h3", "変更後"),
      node("pre", JSON.stringify(change.after, null, 2)),
    );
    view.append(section);
  }
  let submitted = false;
  const submit = button("確認した変更でPRを作成", async () => {
    if (submitted) return;
    submitted = true;
    submit.disabled = true;
    try {
      const result = await api("/api/change-requests", "POST", {
        previewId: plan.id,
      });
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
      throw e;
    }
  });
  view.append(submit, button("編集に戻る（再プレビューが必要）", listView));
  showStatus("プレビュー済み。まだGitHubへ書き込んでいません。");
}
const oldScreen = screen;
screen = function () {
  if (!me) return;
  if (location.hash === "#masters") {
    if (snapshot) listView();
    else loadMasters().catch((e) => showStatus(e.message));
  } else oldScreen();
};
if (me && location.hash === "#masters")
  loadMasters().catch((e) => showStatus(e.message));
