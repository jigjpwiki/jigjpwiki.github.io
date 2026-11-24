const labels = {
  title: ["名称", "text"], venue: ["会場", "text"], summary: ["概要", "textarea"],
  starts: ["開始日時（日本時間）", "datetime-local"], ends: ["終了日時（日本時間）", "datetime-local"],
  format: ["開催形式", "select"], streamUrl: ["配信URL", "url"], fee: ["料金", "number"],
  announcementUrl: ["公式告知URL", "url"], image: ["商品画像URL", "url"],
  identityUrl: ["公式商品情報URL", "url"], url: ["販売ページURL", "url"], price: ["価格（円）", "number"],
};
const categories = {
  event: { category: "events", label: "イベント", fields: ["title", "announcementUrl", "summary", "venue", "starts", "ends", "format", "streamUrl", "fee"] },
  product: { category: "goods", label: "グッズ", fields: ["title", "image", "identityUrl", "url", "price"] },
};

export async function mountSimpleCms(panel, status, api) {
  const el = (tag, value = "") => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const button = (label, handler) => {
    const node = el("button", label);
    node.type = "button";
    node.onclick = handler;
    return node;
  };
  const catalog = await api("/api/cms/catalog");
  const formArea = el("section");
  const list = el("section");
  const draftsArea = el("section");
  panel.append(draftsArea, formArea, list);
  let revision = 0;
  let saveAvailable = true;
  let saved;
  if (catalog.editable) {
    try {
      saved = await api("/api/cms/draft");
      revision = saved.revision;
    } catch {
      saveAvailable = false;
      status.textContent = "下書きを読み込めませんでした。既存の下書きを保護するため保存を停止しました。";
    }
  }
  async function refreshDrafts() {
    saved = await api("/api/cms/draft");
    revision = saved.revision;
    draftsArea.replaceChildren(el("h3", "保存済みの下書き"));
    for (const { draftId, input, conflict } of saved.drafts) {
      const row = el("div");
      row.className = "button-group";
      if (conflict) row.append(el("p", (input?.title || "下書き") + "：元の情報が変更されたか、現在の担当範囲外です。"));
      else row.append(button(input.title, () => edit(input.entity, input, draftId)));
      row.append(button("この下書きを破棄", async () => {
        if (!confirm("この下書きを破棄しますか？")) return;
        try {
          await api("/api/cms/draft", "DELETE", { draftId, revision });
          if (formArea.dataset.draftId === draftId) formArea.replaceChildren();
          await refreshDrafts();
        } catch {
          status.textContent = "下書きを破棄できませんでした。";
        }
      }));
      draftsArea.append(row);
    }
  }
  function edit(entity, input = {}, draftId) {
    const spec = categories[entity];
    const form = el("form");
    form.className = "stack";
    const fields = new Map();
    function add(key, label, control) {
      const wrapping = el("label", label);
      control.value = input[key] ?? (key === "format" ? "unknown" : "");
      wrapping.append(control);
      form.append(wrapping);
      fields.set(key, control);
    }
    for (const key of spec.fields) {
      const [label, type] = labels[key];
      const control = el(["textarea", "select"].includes(type) ? type : "input");
      if (type === "select") control.append(...Object.entries({
        unknown: "未定・不明", onsite: "会場開催", online: "オンライン", hybrid: "会場とオンライン",
      }).map(([value, text]) => new Option(text, value)));
      else if (type !== "textarea") control.type = type;
      control.required = key === "title" || key === "announcementUrl" || key === "summary" || key === "identityUrl";
      if (key === "price") {
        control.min = "0";
        control.step = input.currency && input.currency !== "JPY" ? "any" : "1";
      }
      if (key === "fee") {
        control.min = "0";
        control.step = input.feeCurrency && input.feeCurrency !== "JPY" ? "any" : "1";
      }
      add(key, key === "fee" ? "料金（" + (input.feeCurrency || "JPY") + "）" : key === "price" && input.currency ? "価格（" + input.currency + "）" : label, control);
    }
    if (!input.id) {
      const key = entity === "event" ? "organization" : "talent";
      const choices = entity === "event" ? catalog.organizations : catalog.people;
      const search = el("input");
      search.type = "search";
      const searchLabel = el("label", "候補を絞り込む");
      searchLabel.append(search);
      form.append(searchLabel);
      const select = el("select");
      select.required = true;
      function fill(query = "", active = input[key]) {
        select.replaceChildren(new Option("選択してください", ""), ...choices
          .filter((row) => row.name.includes(query) || row.id === active)
          .map((row) => new Option(row.name, row.id)));
        select.value = active || "";
      }
      fill();
      add(key, entity === "event" ? "関連事務所" : "関連する人物", select);
      search.oninput = () => fill(search.value, select.value);
    }
    const submit = el("button", "下書きを保存");
    submit.disabled = !saveAvailable;
    form.append(submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const values = Object.fromEntries([...fields].map(([key, control]) => [key, control.value]));
        const result = await api("/api/cms/draft", "PUT", {
          entity, id: input.id, draftId, sha: input.sha || catalog.sha, revision, ...values,
        });
        revision = result.revision;
        draftId = result.draftId;
        formArea.dataset.draftId = draftId;
        await refreshDrafts();
        status.textContent = "下書きを保存しました。公開サイトには反映されていません。";
      } catch (error) {
        status.textContent = ["main_changed_reload", "workspace_revision_conflict"].includes(error.message)
          ? "別の更新がありました。入力を控えてから画面を開き直してください。"
          : "保存できませんでした。入力内容と担当範囲を確認してください。";
      } finally {
        submit.disabled = false;
      }
    };
    formArea.dataset.draftId = draftId || "";
    formArea.replaceChildren(el("h3", spec.label + (input.id ? "を編集" : "を登録")), form);
    form.querySelector("input")?.focus();
  }
  if (saved) await refreshDrafts();
  for (const [entity, spec] of Object.entries(categories)) {
    if (catalog.editable && catalog.categories.includes(spec.category))
      list.append(button(spec.label + "を新規登録", () => edit(entity)));
  }
  for (const { entity, label, items } of catalog.sections) {
    const section = el("section");
    const entries = el("ul");
    for (const item of items) {
      const li = el("li");
      if (!catalog.editable || !Object.hasOwn(categories, entity)) li.textContent = item.title;
      else li.append(button(item.title, async () => {
        try {
          const query = new URLSearchParams({ entity, id: item.id });
          const { fields, sha } = await api("/api/cms/detail?" + query);
          edit(entity, { ...fields, id: item.id, sha });
        } catch {
          status.textContent = "この項目は簡易フォームで編集できません。";
        }
      }));
      entries.append(li);
    }
    section.append(el("h3", label), entries);
    list.append(section);
  }
  if (saveAvailable) status.textContent = "担当範囲の公開コンテンツです。";
}
