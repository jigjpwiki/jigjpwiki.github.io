import {
  createDraft,
  fieldChanges,
  fieldLabel,
  tabFor,
  validationIssues,
} from "./draft.js";
import {
  el,
  action,
  portrait,
  textField,
  choice,
  namePicker,
  safeLink,
} from "./controls.js";
const names = { talent: "VTuber", organization: "事務所", group: "グループ" };
const states = {
  unknown: "不明",
  active: "活動中",
  hiatus: "活動休止",
  retired: "引退（確認済み）",
  ended: "活動終了",
  affiliated: "所属中",
  unaffiliated: "未所属",
  current: "現在の所属",
  former: "旧所属",
  public: "公開",
  draft: "非公開",
  former_name: "旧名",
  alias: "別名",
};
const options = (values) => values.map((v) => [v, states[v] || v]);
const services = [
  ["youtube", "YouTube"],
  ["x", "X"],
  ["twitch", "Twitch"],
  ["tiktok", "TikTok"],
];
export function createEditor({
  container,
  entity,
  record,
  initial,
  models,
  schemas,
  onPreview,
  onCancel,
  onDirty,
  savedValue,
  onSelectRecord,
}) {
  const draft = createDraft(record || initial),
    v = draft.value,
    fields = new Map();
  if (savedValue) Object.assign(v, structuredClone(savedValue));
  let tab = "basic",
    confirmed = false,
    busy = false;
  let reason = "";
  const errorSummary = el("div", undefined, "error-summary");
  errorSummary.hidden = true;
  errorSummary.tabIndex = -1;
  errorSummary.setAttribute("role", "alert");
  const header = el("div", undefined, "editor-header"),
    heading = el(
      "h2",
      `${record ? "編集" : "新規登録"}：${record?.displayName || record?.name || names[entity]}`,
    ),
    status = el("p", "変更はありません", "draft-status");
  status.setAttribute("role", "status");
  const body = el("div", undefined, "editor-body"),
    tabs = el("div", undefined, "editor-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "編集する情報");
  const changed = () => {
    confirmed = false;
    onDirty?.(draft.dirty);
    status.textContent = draft.dirty
      ? "未保存の変更があります"
      : "変更はありません";
    const check = container.querySelector("#change-confirmed");
    if (check) check.checked = false;
  };
  const set = (key, value) => {
    v[key] = value;
    changed();
  };
  const text = (label, key, type = "text", object = v, prefix = "") =>
    textField(
      label,
      object[key],
      (x) => {
        object[key] = x;
        changed();
      },
      prefix + "/" + key,
      fields,
      type,
    );
  const select = (label, key, values, object = v, prefix = "") =>
    choice(
      label,
      object[key],
      options(values),
      (x) => {
        object[key] = x;
        changed();
      },
      prefix + "/" + key,
      fields,
    );
  const section = (title, note) => {
    const card = el("section", undefined, "editor-card");
    card.append(el("h3", title));
    if (note) card.append(el("p", note, "muted"));
    return card;
  };
  const optional = (key, title) => {
    const card = section(title, "URLが空の場合は未登録です。");
    const preview = el("div");
    const redrawImage = () =>
      preview.replaceChildren(portrait(v[key]?.url, v.displayName || ""));
    card.append(
      textField(
        title + "URL",
        v[key]?.url,
        (url) => {
          draft.optionalUrl(key, url);
          changed();
          if (key === "profileImage") redrawImage();
        },
        "/" + key + "/url",
        fields,
        "url",
      ),
    );
    if (key === "profileImage") {
      redrawImage();
      card.append(preview);
    }
    return card;
  };
  function arrays(title, key, template, display, render) {
    const card = section(title),
      rows = el("div", undefined, "array-cards");
    const draw = () => {
      for (const path of fields.keys())
        if (path.startsWith("/" + key + "/")) fields.delete(path);
      rows.replaceChildren();
      (v[key] || []).forEach((row, i) => {
        const item = el("article", undefined, "array-card");
        item.append(el("h4", display(row, i)));
        render(item, row, i);
        item.append(
          action(
            `${display(row, i)}を削除`,
            () => {
              if (
                window.confirm(
                  `${display(row, i)}を削除しますか？このカード全体が削除対象です。`,
                )
              ) {
                v[key].splice(i, 1);
                changed();
                draw();
              }
            },
            "danger quiet",
          ),
        );
        const updateTitle = () => {
          item.querySelector("h4").textContent = display(row, i);
          item.lastChild.textContent = `${display(row, i)}を削除`;
        };
        item.addEventListener("input", updateTitle);
        item.addEventListener("change", updateTitle);
        rows.append(item);
      });
    };
    draw();
    card.append(
      rows,
      action(
        title + "を追加",
        () => {
          v[key] ||= [];
          v[key].push(structuredClone(template));
          changed();
          draw();
        },
        "quiet",
      ),
    );
    return card;
  }
  function panelBasic() {
    const grid = el("div", undefined, "edit-grid"),
      base = section("基本情報");
    base.append(
      text(
        entity === "talent" ? "表示名" : "名前",
        entity === "talent" ? "displayName" : "name",
      ),
    );
    if (record)
      base.append(
        el("p", "固定内部ID：" + record.id + "（変更できません）", "muted"),
      );
    grid.append(base);
    if (entity === "talent") {
      grid.append(optional("profileImage", "プロフィール画像"));
      grid.append(
        arrays(
          "別名・旧名",
          "aliases",
          { name: "", type: "alias", from: null, to: null },
          (r, i) => r.name || `別名 ${i + 1}`,
          (item, row, i) => {
            item.append(
              text("別名", "name", "text", row, `/aliases/${i}`),
              select(
                "別名の種類",
                "type",
                ["alias", "former_name"],
                row,
                `/aliases/${i}`,
              ),
              date("使用開始日", "from", row, `/aliases/${i}`),
              date("使用終了日", "to", row, `/aliases/${i}`),
            );
          },
        ),
      );
    }
    if (entity === "group") {
      grid.append(
        section(
          "事務所・メンバー",
          "名前で検索して選択します。内部IDはシステムが保持します。",
        ),
      );
      grid.lastChild.append(
        namePicker(
          "所属事務所",
          v.organizationId,
          models.talents.organizations,
          (x) => set("organizationId", x),
          { path: "/organizationId", registry: fields },
        ),
        namePicker(
          "メンバー",
          v.talentIds,
          models.talents.talents,
          (x) => set("talentIds", x),
          { multiple: true, path: "/talentIds", registry: fields },
        ),
      );
      const label = el("label");
      const check = el("input");
      check.type = "checkbox";
      check.checked = v.membersComplete;
      check.onchange = () => set("membersComplete", check.checked);
      label.append(check, document.createTextNode("メンバー一覧を確認済み"));
      grid.lastChild.append(
        label,
        select("掲載状態", "visibility", ["public", "draft"]),
      );
    }
    return grid;
  }
  function date(label, key, row, prefix) {
    return textField(
      label + "（不明なら空欄）",
      row[key],
      (x) => {
        row[key] = x || null;
        changed();
      },
      prefix + "/" + key,
      fields,
      "date",
    );
  }
  function panelAffiliation() {
    const grid = el("div", undefined, "edit-grid");
    for (const [key, title, schemaKey] of [
      ["agencyStatus", "事務所への所属状態", "agencyState"],
      ["activityStatus", "VTuberとしての活動状態", "activityState"],
    ]) {
      const card = section(
        title,
        "事務所の卒業は、VTuberとしての引退を意味しません。",
      );
      card.append(
        select(
          title,
          "value",
          schemas.definitions[schemaKey].properties.value.enum,
          v[key],
          "/" + key,
        ),
      );
      grid.append(card);
    }
    grid.append(
      arrays(
        "所属履歴",
        "affiliations",
        {
          organizationId: null,
          status: "unknown",
          from: null,
          to: null,
        },
        (r, i) =>
          models.talents.organizations.find((o) => o.id === r.organizationId)
            ?.name || `所属 ${i + 1}`,
        (item, row, i) => {
          item.append(
            namePicker(
              "事務所",
              row.organizationId,
              models.talents.organizations,
              (x) => {
                row.organizationId = x;
                changed();
              },
              { path: `/affiliations/${i}/organizationId`, registry: fields },
            ),
            select(
              "所属区分",
              "status",
              ["current", "former", "unknown"],
              row,
              `/affiliations/${i}`,
            ),
            date("所属開始日", "from", row, `/affiliations/${i}`),
            date("所属終了日", "to", row, `/affiliations/${i}`),
          );
        },
      ),
    );
    return grid;
  }
  function panelLinks() {
    const grid = el("div", undefined, "edit-grid");
    grid.append(
      arrays(
        "SNS・公式アカウント",
        "accounts",
        { service: "youtube", accountId: null, url: "" },
        (r, i) =>
          services.find(([k]) => k === r.service)?.[1] || `アカウント ${i + 1}`,
        (item, row, i) => {
          item.append(
            choice(
              "サービス",
              row.service,
              services,
              (x) => {
                row.service = x;
                changed();
              },
              `/accounts/${i}/service`,
              fields,
            ),
            text("アカウントURL", "url", "url", row, `/accounts/${i}`),
            textField(
              "アカウントID（不明なら空欄）",
              row.accountId,
              (x) => {
                row.accountId = x || null;
                changed();
              },
              `/accounts/${i}/accountId`,
              fields,
            ),
          );
        },
      ),
    );
    grid.append(optional("wiki", "非公式Wiki"));
    return grid;
  }
  function panelHistory() {
    const card = section("変更履歴");
    const history = models["admin-ledger"].entries.filter(
      (e) => e.subject === record?.id,
    );
    for (const h of history)
      card.append(el("p", `${h.at} · ${h.action} · ${h.reason}`));
    if (!history.length)
      card.append(el("p", "管理画面経由の履歴はまだありません。"));
    card.append(
      safeLink(
        "GitHubで過去の変更を確認",
        "https://github.com/jigjpwiki/jigjpwiki.github.io/commits/main/data/" +
          (entity === "group" ? "catalog" : "talents") +
          ".json",
      ),
    );
    return card;
  }
  function panelReview() {
    const card = section(
      "確認・プレビュー",
      "この操作ではまだPRを作成しません。変更内容と理由を確認して、全マスターの検証へ進みます。",
    );
    const changes = fieldChanges(draft.original, v);
    for (const c of changes)
      card.append(el("p", `${c.kind}：${fieldLabel(c.path)}`));
    if (!changes.length) card.append(el("p", "変更はまだありません。"));
    const input = el("textarea");
    input.value = reason;
    input.oninput = () => {
      reason = input.value;
    };
    card.append(labelledReview("変更理由", input));
    const check = el("input");
    check.type = "checkbox";
    check.id = "change-confirmed";
    check.checked = confirmed;
    check.onchange = () => (confirmed = check.checked);
    const label = el("label");
    label.append(check, document.createTextNode("変更内容を確認しました"));
    const confirmationError = el("p", undefined, "field-error");
    confirmationError.hidden = true;
    confirmationError.id = "confirmation-error";
    check.setAttribute("aria-describedby", confirmationError.id);
    fields.set("/confirmation", {
      input: check,
      error: confirmationError,
      box: label,
    });
    card.append(label, confirmationError);
    const submit = action("変更プレビュー", async () => {
      if (busy) return;
      clearErrors();
      const problems = localIssues();

      if (!confirmed)
        problems.push({
          path: "/confirmation",
          message: "変更内容を確認してチェックしてください。",
          tab: "review",
        });
      if (problems.length) {
        renderErrors(problems);
        return;
      }
      busy = true;
      const controls = [
        ...container.querySelectorAll("button,input,select,textarea"),
      ];
      for (const control of controls) control.disabled = true;
      container.setAttribute("aria-busy", "true");
      submit.disabled = true;
      submit.textContent = "全マスターを検証中…";
      try {
        await onPreview({
          value: draft.payload(),
          reason,
        });
      } catch (e) {
        renderErrors(validationIssues(e.message, models, record?.id));
      } finally {
        busy = false;
        for (const control of controls) control.disabled = false;
        container.removeAttribute("aria-busy");
        submit.disabled = false;
        submit.textContent = "変更プレビュー";
      }
    });
    card.append(submit);
    return card;
  }
  function labelledReview(text, input) {
    return text === "変更理由"
      ? registerReview("/reason", text, input)
      : registerReview("/confirmation", text, input);
  }
  function registerReview(path, text, input) {
    const wrapper = el("div", undefined, "form-field"),
      label = el("label", text === "変更理由" ? "変更理由（任意）" : text),
      error = el("p", undefined, "field-error");
    input.id = "edit-" + path.slice(1);
    label.htmlFor = input.id;
    input.setAttribute("aria-label", text);
    error.id = input.id + "-error";
    error.hidden = true;
    input.setAttribute("aria-describedby", error.id);
    wrapper.append(label, input, error);
    fields.set(path, { input, error, box: wrapper });
    return wrapper;
  }
  function localIssues() {
    const result = [];
    if (!String(v.displayName ?? v.name ?? "").trim())
      result.push({
        path: entity === "talent" ? "/displayName" : "/name",
        message: "名前を入力してください。",
        tab: "basic",
      });
    return result;
  }
  function clearErrors() {
    issues = [];
    errorSummary.replaceChildren();
    errorSummary.hidden = true;
    for (const f of fields.values()) {
      f.input.removeAttribute("aria-invalid");
      f.error.hidden = true;
    }
  }
  let issues = [];
  function renderErrors(next) {
    issues = next;
    errorSummary.hidden = false;
    errorSummary.replaceChildren(el("h3", "入力内容を確認してください"));
    for (const issue of issues) {
      const message = `${issue.recordName ? issue.recordName + "：" : ""}${fieldLabel(issue.path)} ${issue.message}`;
      const go = action(message, () => {
        if (issue.external) {
          if (onSelectRecord) onSelectRecord(issue.recordId);
          return;
        }
        tab = issue.tab || tabFor(issue.path);
        draw();
        const f =
          fields.get(issue.path) ||
          fields.get(issue.path.split("/").slice(0, -1).join("/"));
        if (f) {
          for (
            let parent = f.input.parentElement;
            parent;
            parent = parent.parentElement
          )
            if (parent.tagName === "DETAILS") parent.open = true;
          f.input.focus();
        }
      });
      errorSummary.append(go);
    }
    markErrors();
    errorSummary.focus();
  }
  function markErrors() {
    for (const issue of issues) {
      if (issue.external) continue;
      const f = fields.get(issue.path);
      if (f) {
        for (
          let parent = f.input.parentElement;
          parent;
          parent = parent.parentElement
        )
          if (parent.tagName === "DETAILS") parent.open = true;
        f.input.setAttribute("aria-invalid", "true");
        f.error.textContent = issue.message;
        f.error.hidden = false;
      }
    }
  }
  const tabItems =
    entity === "talent"
      ? [
          ["basic", "基本情報"],
          ["affiliation", "所属・活動"],
          ["links", "SNS・リンク"],
          ["history", "変更履歴"],
          ["review", "確認・プレビュー"],
        ]
      : [
          ["basic", "基本情報"],
          ["history", "変更履歴"],
          ["review", "確認・プレビュー"],
        ];
  function draw() {
    fields.clear();
    header.replaceChildren(
      portrait(v.profileImage?.url, v.displayName || v.name),
      el("div"),
    );
    header.lastChild.append(
      heading,
      el(
        "p",
        record
          ? "登録済みの情報を編集します"
          : "確認済みの情報だけを新規登録します",
      ),
      status,
    );
    if (entity === "talent") {
      const affiliations = el(
        "p",
        (v.affiliations || [])
          .map(
            (a) =>
              (a.status === "former" ? "旧所属：" : "") +
              (models.talents.organizations.find(
                (o) => o.id === a.organizationId,
              )?.name || "所属不明"),
          )
          .join("・") || "所属未登録",
        "muted",
      );
      const links = el("div", undefined, "row");
      for (const account of v.accounts || [])
        links.append(
          safeLink(
            services.find(([id]) => id === account.service)?.[1] ||
              account.service,
            account.url,
          ),
        );
      header.lastChild.append(affiliations, links);
    }
    tabs.replaceChildren();
    for (const [key, title] of tabItems) {
      const b = action(title, () => {
        tab = key;
        draw();
      });
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tab === key));
      b.id = "tab-" + key;
      b.setAttribute("aria-controls", "editor-panel");
      b.tabIndex = tab === key ? 0 : -1;
      b.onkeydown = (e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          let index = tabItems.findIndex(([k]) => k === tab);
          index =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? tabItems.length - 1
                : (index + (e.key === "ArrowLeft" ? -1 : 1) + tabItems.length) %
                  tabItems.length;
          tab = tabItems[index][0];
          draw();
          container.querySelector("#tab-" + tab).focus();
        }
      };
      tabs.append(b);
    }
    body.id = "editor-panel";
    body.setAttribute("role", "tabpanel");
    body.setAttribute("aria-labelledby", "tab-" + tab);
    body.replaceChildren(
      tab === "basic"
        ? panelBasic()
        : tab === "affiliation"
          ? panelAffiliation()
          : tab === "links"
            ? panelLinks()
            : tab === "history"
              ? panelHistory()
              : panelReview(),
    );
    markErrors();
  }
  const toolbar = el("div", undefined, "editor-toolbar");
  toolbar.append(
    action("一覧へ戻る", onCancel, "quiet"),
    action("変更を確認", () => {
      tab = "review";
      draw();
      container.querySelector("#tab-review").focus();
    }),
  );
  container.replaceChildren(header, errorSummary, tabs, body, toolbar);
  draw();
  return {
    draft,
    get pending() {
      return busy;
    },
    get dirty() {
      return draft.dirty;
    },
    showErrors: (message) =>
      renderErrors(validationIssues(message, models, record?.id)),
    show() {
      container.replaceChildren(header, errorSummary, tabs, body, toolbar);
      draw();
    },
  };
}
