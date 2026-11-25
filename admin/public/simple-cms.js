import { mountCmsHistory } from "./cms-history.js";
import { renderDraftConflicts } from "./cms-conflicts.js";

const labels = {
  name: ["名称", "text"], status: ["販売状態", "select"], periodNote: ["販売条件・補足", "textarea"],
  currency: ["通貨", "text"], rawLabel: ["曲名・表示名", "text"],
  order: ["曲順", "number"], startsAtSeconds: ["開始秒（任意）", "number"],
  endsAtSeconds: ["終了秒（任意）", "number"], verification: ["確認状態", "select"],
  artists: ["原曲アーティスト（1行に1名）", "textarea"],
  aliases: ["曲の別名（1行に1件）", "textarea"], readings: ["曲名の読み（1行に1件）", "textarea"],
  songIdentityUrl: ["楽曲の公式情報URL", "url"],
  rawSongTitle: ["動画に記載された曲名", "text"], videoUrl: ["YouTube動画URL", "url"], videoKind: ["動画の種類", "select"],
  aliasNames: ["別名（1行に1件）", "textarea"], youtubeUrl: ["YouTubeチャンネルURL", "url"], xUrl: ["XプロフィールURL", "url"],
  twitchUrl: ["TwitchチャンネルURL", "url"], tiktokUrl: ["TikTokプロフィールURL", "url"], wikiUrl: ["WikiページURL", "url"],
  displayName: ["表示名", "text"], activity: ["活動状態", "select"], officialProfileUrl: ["公式プロフィールURL", "url"],
  startsAt: ["販売開始（日本時間）", "datetime-local"], endsAt: ["販売終了（日本時間）", "datetime-local"],
  month: ["月", "number"], day: ["日", "number"], year: ["年（任意）", "number"], kind: ["記念日の種類", "select"],
  title: ["名称", "text"], venue: ["会場", "text"], summary: ["概要", "textarea"],
  starts: ["開始日時（日本時間）", "datetime-local"], ends: ["終了日時（日本時間）", "datetime-local"],
  format: ["開催形式", "select"], streamUrl: ["配信URL", "url"], fee: ["料金", "number"],
  announcementUrl: ["公式告知URL", "url"], thumbnailUrl: ["イベントサムネイルURL（16:9・任意）", "url"], image: ["商品画像URL", "url"],
  identityUrl: ["公式商品情報URL", "url"], url: ["販売ページURL", "url"], price: ["価格（円）", "number"],
};
const categories = {
  organization: { category: "organizations", label: "事務所", fields: ["name"] },
  group: { category: "organizations", label: "グループ", fields: ["name"] },
  offer: { category: "goods", label: "販売情報", fields: ["url", "price", "currency", "startsAt", "endsAt", "status", "periodNote"] },
  performance: { category: "music", label: "歌唱記録", fields: ["rawLabel", "order", "startsAtSeconds", "endsAtSeconds", "verification"] },
  video: { category: "music", label: "動画情報", fields: ["videoUrl"] },
  karaoke: { category: "music", label: "歌枠", fields: ["videoUrl"] },
  song: { category: "music", label: "楽曲", fields: ["title", "artists", "aliases", "readings"], ownerCreate: true },
  musicVideo: { category: "music", label: "歌動画", fields: ["rawSongTitle", "videoUrl", "videoKind"] },
  talent: { category: "talents", label: "VTuber", fields: ["displayName", "image", "activity", "officialProfileUrl", "aliasNames", "youtubeUrl", "xUrl"] },
  campaign: { category: "goods", label: "キャンペーン", fields: ["title"] },
  anniversary: { category: "anniversaries", label: "記念日", fields: ["title", "kind", "month", "day", "year"] },
  event: { category: "events", label: "イベント", fields: ["title", "thumbnailUrl", "announcementUrl", "summary", "venue", "starts", "ends", "format", "streamUrl", "fee"] },
  product: { category: "goods", label: "グッズ", fields: ["title", "image", "identityUrl"] },
};

export async function mountSimpleCms(panel, status, api, options = {}) {
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
  const view = options.view || "legacy";
  const selectedEntity = options.entity;
  const musicView = ["song", "musicVideo", "karaoke", "performance"].includes(selectedEntity);
  const catalog = await api("/api/cms/catalog" + (musicView ? "?fresh=1" : ""));
  const sections = selectedEntity ? catalog.sections.filter(({ entity }) => entity === selectedEntity) : catalog.sections;
  const browsing = ["legacy", "content", "search"].includes(view);
  let pickerSequence = 0;
  const relationEntries = (rows) => (rows || []).map((row) => ({
    ...row, name: row.name || row.title || row.id,
    needle: [row.name || row.title, row.id, row.context, row.search].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja"),
  }));
  function relationPicker({ choices, selected, label, multiple = false, onChange, disabled = () => false, empty = "選択してください" }) {
    const group = el("div");
    group.className = "cms-picker cms-relation-combobox";
    const chips = el("div");
    chips.className = "cms-picker-chips";
    const search = el("input");
    search.type = "search";
    search.placeholder = "名前・別名・IDで検索";
    search.setAttribute("role", "combobox");
    search.setAttribute("aria-label", label);
    search.setAttribute("aria-autocomplete", "list");
    search.setAttribute("aria-expanded", "false");
    search.autocomplete = "off";
    const popup = el("div"), list = el("div"), summary = el("small");
    popup.className = "cms-picker-popup";
    popup.hidden = true;
    list.className = "cms-picker-listbox";
    list.id = "cms-relation-options-" + (++pickerSequence);
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label + "の候補");
    search.setAttribute("aria-controls", list.id);
    summary.className = "cms-picker-count";
    summary.setAttribute("aria-live", "polite");
    let entries = relationEntries(choices), lookup = new Map(entries.map(row => [row.id, row]));
    let matching = [], active = -1, rendered = 0;
    const chunk = 40;
    const isDisabled = () => !catalog.editable || disabled();
    const labelFor = (id) => lookup.get(id)?.name || id + "（現在の参照）";
    function syncChips() {
      chips.replaceChildren(...[...selected].map(id => {
        const chip = el("span", labelFor(id));
        chip.className = "cms-picker-chip";
        const remove = button("×", () => {
          if (isDisabled()) return;
          selected.delete(id); changed(); search.focus();
        });
        remove.setAttribute("aria-label", labelFor(id) + "の選択を解除");
        remove.dataset.pickerNavigation = "";
        remove.disabled = isDisabled();
        chip.append(remove);
        return chip;
      }));
      chips.hidden = !selected.size;
      search.placeholder = selected.size ? multiple ? "さらに追加する" : "別の候補を検索" : empty + "・検索";
      search.disabled = isDisabled();
    }
    function close() {
      popup.hidden = true; search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      active = -1;
    }
    function choose(id) {
      if (isDisabled() || !lookup.has(id)) return;
      if (multiple && selected.size >= 100 && !selected.has(id)) {
        summary.textContent = "関連レコードは最大100件です。";
        return;
      }
      if (!multiple) selected.clear();
      selected.add(id);
      search.value = "";
      changed();
      search.focus({ preventScroll: true });
      close();
    }
    function changed() {
      syncChips();
      onChange([...selected]);
      if (!popup.hidden) refresh();
    }
    function appendChunk() {
      const end = Math.min(rendered + chunk, matching.length);
      for (; rendered < end; rendered++) {
        const row = matching[rendered];
        const item = button("", () => choose(row.id));
        item.type = "button";
        item.id = list.id + "-" + rendered;
        item.className = "cms-picker-option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.dataset.pickerNavigation = "";
        item.tabIndex = -1;
        item.append(el("span", row.name + (row.visibility === "draft" ? "（非公開）" : "")));
        if (row.context) item.append(el("small", row.context));
        item.append(el("small", row.id));
        item.addEventListener("mousedown", event => event.preventDefault());
        list.append(item);
      }
      more.hidden = rendered >= matching.length;
      summary.textContent = matching.length + "件の候補・" + selected.size + "件選択中" +
        (rendered < matching.length ? "（スクロールで続きを表示）" : "");
    }
    const more = button("さらに候補を表示", () => { appendChunk(); search.focus({ preventScroll: true }); });
    more.dataset.pickerNavigation = "";
    more.addEventListener("mousedown", event => event.preventDefault());
    function refresh() {
      const query = search.value.trim().normalize("NFKC").toLocaleLowerCase("ja");
      matching = entries.filter(row => !selected.has(row.id) && query.split(/\s+/).every(word => row.needle.includes(word)));
      active = -1; rendered = 0;
      search.removeAttribute("aria-activedescendant");
      list.replaceChildren(); list.scrollTop = 0;
      appendChunk();
      if (!matching.length) list.append(el("p", "一致する候補がありません"));
    }
    function open() {
      if (isDisabled()) return;
      if (popup.hidden) {
        popup.hidden = false; search.setAttribute("aria-expanded", "true"); refresh();
      }
    }
    function move(delta) {
      open();
      if (!matching.length) return;
      active = Math.max(0, Math.min(matching.length - 1, active + delta));
      while (active >= rendered) appendChunk();
      const item = list.children[active];
      for (const node of list.querySelectorAll("[data-active]")) delete node.dataset.active;
      item.dataset.active = "true";
      search.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    }
    list.addEventListener("scroll", () => {
      if (!popup.hidden && rendered < matching.length && list.scrollTop + list.clientHeight >= list.scrollHeight - 48) appendChunk();
    });
    search.addEventListener("focus", open);
    search.addEventListener("click", open);
    search.addEventListener("input", () => { open(); refresh(); });
    search.addEventListener("keydown", event => {
      if (event.isComposing || isDisabled()) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter" && !popup.hidden) {
        event.preventDefault();
        if (active >= 0) choose(matching[active].id);
      } else if (event.key === "Escape" && !popup.hidden) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    });
    group.addEventListener("focusout", event => {
      if (!group.contains(event.relatedTarget)) close();
    });
    popup.append(summary, list, more);
    group.append(chips, search, popup);
    group.refreshChoices = rows => {
      entries = relationEntries(rows); lookup = new Map(entries.map(row => [row.id, row]));
      syncChips(); if (!popup.hidden) refresh();
    };
    group.syncDisabled = syncChips;
    syncChips();
    return group;
  }
  function pickerField(label, control) {
    const wrapper = el(control.cmsPicker ? "div" : "label", label);
    if (control.cmsPicker) {
      wrapper.className = "cms-picker-field";
      const caption = el("span", label);
      caption.className = "cms-picker-label";
      const search = control.cmsPicker.querySelector("input");
      search.setAttribute("aria-label", label);
      search.setAttribute("aria-required", String(control.required));
      control.cmsPicker.syncDisabled();
      wrapper.replaceChildren(caption, control.cmsPicker, control);
    } else wrapper.append(control);
    return wrapper;
  }
  function bindPicker(select, choices, selected, label, empty = "選択してください", paged = false) {
    if (view !== "legacy") {
      const chosen = new Set(selected ? [selected] : []);
      const updateValue = (ids) => {
        select.replaceChildren(new Option(empty, ""), ...ids.map(id => new Option(id, id)));
        select.value = ids[0] || "";
      };
      updateValue([...chosen]);
      select.hidden = true;
      select.dataset.relationValue = "";
      const group = relationPicker({ choices, selected: chosen, label, empty,
        disabled: () => select.disabled,
        onChange: ids => {
          updateValue(ids);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        },
      });
      if (paged) group.classList.add("cms-song-picker");
      select.cmsPicker = group;
      select.addEventListener("invalid", event => {
        event.preventDefault();
        const search = group.querySelector("input");
        search.focus();
        search.setCustomValidity("候補から選択してください。");
        search.reportValidity();
        search.setCustomValidity("");
      });
      return group;
    }
    const search = el("input");
    search.type = "search";
    search.placeholder = paged ? "曲名・原曲アーティスト・別名・ID" : "名前・IDで検索";
    search.setAttribute("aria-label", label + "を検索");
    const group = el("div");
    group.className = "cms-picker" + (paged ? " cms-song-picker" : "");
    const summary = el("small");
    summary.setAttribute("aria-live", "polite");
    const norm = (text) => String(text ?? "").normalize("NFKC").toLocaleLowerCase("ja");
    const entriesOf = (rows) => (rows || []).map((row) => ({
      id: row.id, name: row.name || row.title || row.id, context: row.context || "",
      search: row.search || "", visibility: row.visibility,
    }));
    let entries = entriesOf(choices), page = 0;
    const pageSize = 50;
    const previous = button("楽曲候補の前のページ", () => { page--; refresh(select.value); });
    const next = button("楽曲候補の次のページ", () => { page++; refresh(select.value); });
    previous.dataset.pickerNavigation = next.dataset.pickerNavigation = "";
    function refresh(current) {
      const query = norm(search.value.trim());
      const matched = entries.filter((row) => norm([row.name, row.id, row.context, row.search].join(" ")).includes(query));
      const candidates = matched.filter((row) => row.id !== current);
      const maxPage = Math.max(0, Math.ceil(candidates.length / pageSize) - 1);
      page = Math.max(0, Math.min(page, maxPage));
      const visible = candidates.slice(page * pageSize, (page + 1) * pageSize);
      const chosen = entries.find((row) => row.id === current);
      if (current) visible.unshift(chosen || { id: current, name: current + "（現在の参照）" });
      select.replaceChildren(new Option(empty, ""), ...visible.map((row) =>
        new Option(row.name + (row.context ? " / " + row.context : "") + (paged && row.visibility === "draft" ? "（非公開）" : ""), row.id)));
      select.value = current || "";
      summary.textContent = matched.length + "件の候補" + (paged ? "・" + (page + 1) + "/" + (maxPage + 1) + "ページ" : matched.length > pageSize ? "・検索で絞り込み" : "");
      previous.disabled = page === 0;
      next.disabled = page >= maxPage;
    }
    refresh(selected);
    search.oninput = () => { page = 0; refresh(select.value); };
    group.append(search, summary);
    if (paged) {
      const controls = el("div");
      controls.className = "cms-song-picker-pages";
      controls.append(previous, next);
      group.append(controls);
      group.refreshChoices = (rows) => { entries = entriesOf(rows); page = 0; refresh(select.value); };
    }
    return group;
  }
  function songPicker(select, selected, label = "曲名・原曲アーティスト") {
    return bindPicker(select, catalog.songs, selected, label, "紐づけなし", true);
  }

  const formArea = el("section");
  const list = el("section");
  list.className = "cms-collection-list";
  const draftsArea = el("section");
  draftsArea.className = "cms-drafts-area stack";
  const workspaceArea = el("div");
  workspaceArea.className = "cms-collection-workspace";
  if (view !== "legacy") panel.dataset.cmsLayout = browsing ? "collection" : "page";
  if (browsing && view !== "legacy") {
    panel.append(draftsArea, workspaceArea);
    workspaceArea.append(list, formArea);
  } else panel.append(draftsArea, formArea, list);
  formArea.setAttribute("role", "region");
  formArea.setAttribute("aria-label", "レコード詳細");
  let requestSerial = 0;
  let restoreFocus;
  let saving = false;
  const closeEditor = (force = false) => {
    if (saving) return;
    if (!force && panel.dataset.cmsDirty && !confirm("保存していない入力を破棄しますか？")) return;
    requestSerial++;
    delete panel.dataset.cmsDirty;
    delete formArea.dataset.draftId;
    formArea.replaceChildren();
    formArea.hidden = true;
    workspaceArea.classList.remove("has-editor");
    if (restoreFocus?.isConnected && !restoreFocus.disabled) restoreFocus.focus();
    else (list.querySelector("button, input") || panel.querySelector("h2"))?.focus();
  };
  formArea.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.target.matches("select, input[type=search]")) {
      event.preventDefault();
      closeEditor();
    }
  });
  draftsArea.hidden = !["legacy", "drafts", "dashboard"].includes(view);
  list.hidden = !browsing;
  formArea.className = "cms-editor stack";
  formArea.hidden = true;
  let refreshList = () => {};
  const publicationArea = el("section");
  publicationArea.className = "cms-publication-area stack";
  const publicationStatus = el("p");
  publicationStatus.className = "cms-publication-status";
  const publicationProgress = el("ol");
  publicationProgress.className = "cms-publication-progress";
  const publicationMeta = el("div");
  publicationMeta.className = "cms-publication-meta";
  const publishedRecords = el("details");
  publishedRecords.hidden = true;
  publicationStatus.setAttribute("role", "status");
  const selectedDrafts = new Set();
  let publication;
  const tracksPublication = catalog.editable && catalog.publicationTracking !== false &&
    ["legacy", "publication", "dashboard", "drafts"].includes(view);
  if (tracksPublication) {
    publicationArea.hidden = !["legacy", "publication", "dashboard"].includes(view);
    publicationArea.append(el("h3", "公開状況"), publicationStatus, publicationProgress, publicationMeta, publishedRecords);
    panel.insertBefore(publicationArea, draftsArea);
  }

  async function refreshPublication() {
    const result = await api("/api/cms/publication");
    showPublication(result.publication);
  }

  function showPublication(value) {
    publication = value;
    reconcileButton.hidden = publication?.phase !== "unconfirmed" || !publication.commit;
    const labels = {
      queued: "公開の順番待ち", candidate: "変更候補を作成中",
      checking: "検証中", promoting: "反映中", pages: "公開サイトへの反映待ち",
      published: "公開サイトへの反映を確認しました", failed: "公開できませんでした。下書きは保存されています。",
      unconfirmed: publication?.mainConfirmed
        ? "変更は反映済みです。公開サイトへの反映を確認してください。"
        : "公開結果を確認できませんでした。状況を再確認してください。",
    };
    const errors = {
      cms_publish_conflict: "他の編集で同じ項目が変更されています。",
      cms_scope_denied: "現在の担当範囲と公開権限を確認してください。",
      cms_candidate_ci_failed: "自動検証に失敗しました。",
    };
    publicationStatus.textContent = publication
      ? (labels[publication.phase] || "公開状況を確認中") + (errors[publication.error] || "")
      : "公開処理はありません。";
    publicationStatus.dataset.phase = publication?.phase || "idle";
    const stages = [
      ["queued", "順番待ち"], ["candidate", "候補作成"], ["checking", "CI検証"],
      ["promoting", "main反映"], ["pages", "サイト反映"], ["published", "完了"],
    ];
    const stage = stages.findIndex(([key]) => key === publication?.phase);
    publicationProgress.hidden = stage < 0;
    publicationProgress.replaceChildren(...stages.map(([key, label], index) => {
      const item = el("li", label);
      item.dataset.progress = index < stage ? "done" : index === stage ? "current" : "pending";
      if (index === stage) item.setAttribute("aria-current", "step");
      return item;
    }));
    publicationMeta.replaceChildren();
    if (publication?.createdAt && Number.isFinite(Date.parse(publication.createdAt)))
      publicationMeta.append(el("p", "受付日時：" + new Date(publication.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })));
    if (/^[0-9a-f]{40}$/.test(publication?.commit || "")) {
      const commit = el("a", "コミット " + publication.commit.slice(0, 8));
      commit.href = "https://github.com/jigjpwiki/jigjpwiki.github.io/commit/" + publication.commit;
      commit.target = "_blank";
      commit.rel = "noopener noreferrer";
      publicationMeta.append(commit);
    }
    const records = publication?.createdRecords || [];
    publishedRecords.hidden = records.length === 0;
    const list = el("ul");
    for (const { entity, id } of records) {
      const label = (categories[entity]?.label || entity) + " — " + id;
      const row = el("li");
      if (catalog.editable && Object.hasOwn(categories, entity))
        row.append(button(label, () => openRecord(entity, id)));
      else row.textContent = label;
      list.append(row);
    }
    publishedRecords.replaceChildren(el("summary", "発行済みレコード"), list);
  }

  const reconcileButton = button("公開結果を再確認", async () => {
    reconcileButton.disabled = true;
    try {
      const result = await api("/api/cms/publication/reconcile", "POST", { jobId: publication.id });
      showPublication(result.publication);
      await refreshDrafts();
    } catch (error) {
      publicationStatus.textContent = error.message === "cms_publication_reconcile_wait"
        ? "少し待ってから再確認してください。" : "公開結果を確認できませんでした。";
    } finally {
      reconcileButton.disabled = false;
    }
  });
  reconcileButton.hidden = true;
  if (tracksPublication) {
    publicationArea.append(button("公開状況を更新", async () => {
      try {
        await refreshPublication();
        await refreshDrafts();
      } catch { publicationStatus.textContent = "公開状況を確認できませんでした。"; }
    }), reconcileButton);
    refreshPublication().catch(() => { publicationStatus.textContent = "公開状況を確認できませんでした。"; });
  }
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
  async function refreshDrafts(reuse = false) {
    if (reuse !== true) saved = await api("/api/cms/draft");
    revision = saved.revision;
    const draftHeading = el("div");
    draftHeading.className = "cms-section-heading";
    draftHeading.append(el("h3", "保存済みの下書き"), el("span", saved.drafts.length + "件"));
    draftsArea.replaceChildren(draftHeading);
    refreshList();
    const eligible = new Set(saved.drafts.filter(({ conflict, reapplyJobId }) => !conflict && !reapplyJobId).map(({ draftId }) => draftId));
    for (const draftId of selectedDrafts) if (!eligible.has(draftId)) selectedDrafts.delete(draftId);
    let updateSelection = () => {};
    const selectionChecks = new Map();
    if (catalog.publishable) {
      const reviewArea = el("section");
      reviewArea.className = "stack cms-review-area";
      const selection = el("span");
      selection.setAttribute("role", "status");
      const publish = button("選択した下書きを確認", async () => {
        if (!selectedDrafts.size || selectedDrafts.size > 12) return;
        publish.disabled = true;
        try {
          const draftIds = [...selectedDrafts];
          const checkedRevision = revision;
          const result = await api("/api/cms/publication/preview", "POST", { draftIds, revision });
          if (checkedRevision !== revision || draftIds.length !== selectedDrafts.size || draftIds.some((id) => !selectedDrafts.has(id))) return;
          reviewArea.replaceChildren(el("h3", "公開する変更"));
          for (const record of result.records) {
            const section = el("section");
            section.className = "stack";
            section.append(el("h4", record.name));
            for (const change of record.changes) {
              const format = (value) => value === null ? "未設定" : JSON.stringify(value, null, 2);
              const diff = el("div");
              diff.className = "cms-diff";
              for (const [label, value, kind] of [["変更前", change.before, "before"], ["変更後", change.after, "after"]]) {
                const cell = el("div");
                cell.dataset.diff = kind;
                cell.append(el("small", label), el("pre", format(value)));
                diff.append(cell);
              }
              section.append(el("p", change.field), diff);
            }
            reviewArea.append(section);
          }
          const confirmation = el("input");
          confirmation.type = "checkbox";
          const label = el("label", "変更内容を確認しました");
          label.prepend(confirmation);
          const submit = button("確認した変更を公開", async () => {
            if (!confirmation.checked || checkedRevision !== revision || draftIds.length !== selectedDrafts.size ||
              draftIds.some((id) => !selectedDrafts.has(id))) {
              reviewArea.replaceChildren(el("p", "選択または下書きが変更されました。再度差分を確認してください。"));
              return;
            }
            submit.disabled = true;
            try {
              await api("/api/cms/publication", "POST", {
                draftIds, revision: checkedRevision, review: result.review,
                retry: publication?.phase === "failed",
              });
              reviewArea.replaceChildren(el("p", "公開処理を受け付けました。公開状況で確認できます。"));
              await refreshPublication();
            } catch {
              status.textContent = "公開を開始できませんでした。最新の下書きと差分を確認し直してください。";
            } finally { submit.disabled = !confirmation.checked; }
          });
          submit.disabled = true;
          confirmation.onchange = () => { submit.disabled = !confirmation.checked; };
          reviewArea.append(label, submit);
          confirmation.focus();
        } catch (error) {
          status.textContent = error.message === "cms_draft_already_applied"
            ? "発行済みレコードに紐づけてから変更を確認してください。"
            : "変更を確認できませんでした。最新の下書きと担当範囲を確認してください。";
        } finally {
          publish.disabled = selectedDrafts.size === 0 || selectedDrafts.size > 12;
        }
      });
      publish.className = "primary";
      const all = el("input");
      all.type = "checkbox";
      all.setAttribute("aria-label", "公開可能な下書きを全選択");
      const allLabel = el("label", "全選択");
      allLabel.prepend(all);
      const firstBatch = button("先頭12件を選択", () => {
        selectedDrafts.clear();
        for (const id of [...eligible].slice(0, 12)) selectedDrafts.add(id);
        updateSelection();
      });
      all.onchange = () => {
        selectedDrafts.clear();
        if (all.checked) for (const id of eligible) selectedDrafts.add(id);
        updateSelection();
      };
      updateSelection = () => {
        selection.textContent = selectedDrafts.size + " / " + eligible.size + "件選択中（1回最大12件）" +
          (selectedDrafts.size > 12 ? "・12件以下に絞ってから確認してください。" : "");
        all.checked = eligible.size > 0 && selectedDrafts.size === eligible.size;
        all.indeterminate = selectedDrafts.size > 0 && selectedDrafts.size < eligible.size;
        all.disabled = !eligible.size;
        firstBatch.hidden = eligible.size <= 12 || selectedDrafts.size <= 12;
        for (const [id, checkbox] of selectionChecks) checkbox.checked = selectedDrafts.has(id);
        publish.disabled = selectedDrafts.size === 0 || selectedDrafts.size > 12;
        reviewArea.replaceChildren();
      };
      updateSelection();
      const controls = el("div");
      controls.className = "cms-draft-controls";
      controls.append(allLabel, selection, firstBatch, publish);
      draftsArea.append(el("p", "公開する下書きを選んでください。"), controls, reviewArea);
    }
    if (!saved.drafts.length) draftsArea.append(el("p", "保存済みの下書きはありません。"));
    for (const { draftId, input, conflict, reapplyJobId } of saved.drafts) {
      const row = el("div");
      row.className = "cms-draft-row button-group";
      if (catalog.publishable && !conflict && !reapplyJobId) {
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedDrafts.has(draftId);
        selectionChecks.set(draftId, checkbox);
        checkbox.onchange = () => {
          if (checkbox.checked) selectedDrafts.add(draftId); else selectedDrafts.delete(draftId);
          updateSelection();
        };
        const label = el("label", "公開する");
        checkbox.setAttribute("aria-label", (input?.title || input?.displayName || input?.rawSongTitle || input?.name || input?.rawLabel || input?.id || "下書き") + "を公開する");
        label.prepend(checkbox);
        row.append(label);
      }
      const draftName = input?.title || input?.displayName || input?.rawSongTitle || input?.name || input?.rawLabel || input?.id || "下書き";
      const meta = el("span", (categories[input?.entity]?.label || "コンテンツ") + "・" +
        (input?.id ? "既存更新" : input ? "新規登録" : "要確認") + (conflict ? "・競合あり" : reapplyJobId ? "・再適用が必要" : "・保存済み"));
      meta.className = "cms-draft-meta";
      row.append(meta);
      if (conflict) row.append(el("p", draftName + "：元の情報が変更されたか、現在の担当範囲外です。"));
      else if (input && Object.hasOwn(categories, input.entity)) row.append(button(draftName, () => edit(input.entity, input, draftId)));
      if (conflict) row.append(button("最新の情報と比較", async () => {
        try {
          await renderDraftConflicts({ container: row, api, draftId, afterSave: refreshDrafts });
        } catch {
          status.textContent = "最新データと比較できませんでした。現在の担当範囲と対象の公開状態をご確認ください。";
        }
      }));
      if (reapplyJobId) {
        row.append(button("発行済みレコードに再適用", async () => {
          try {
            const result = await api("/api/cms/publication/reapply", "POST", {
              jobId: reapplyJobId, draftId, revision,
            });
            revision = result.revision;
            await refreshDrafts();
            status.textContent = result.needsResolution
              ? "発行済みレコードに紐づけました。「最新の情報と比較」から重なった変更を確認してください。"
              : "発行済みレコードに紐づけた下書きを保存しました。";
          } catch {
            status.textContent = "自動で再適用できませんでした。下書きを保持しています。";
          }
        }));
      }
      row.append(button("この下書きを破棄", async () => {
        if (saving || !confirm(formArea.dataset.draftId === draftId && panel.dataset.cmsDirty ?
          "未保存の入力を含め、この下書きを破棄しますか？" : "この下書きを破棄しますか？")) return;
        try {
          await api("/api/cms/draft", "DELETE", { draftId, revision });
          if (formArea.dataset.draftId === draftId) closeEditor(true);
          await refreshDrafts();
        } catch {
          status.textContent = "下書きを破棄できませんでした。";
        }
      }));
      draftsArea.append(row);
    }
  }
  function edit(entity, input = {}, draftId) {
    if (saving || !panel.isConnected || !Object.hasOwn(categories, entity)) return;
    if (panel.dataset.cmsDirty && !confirm("保存していない入力を破棄して別の編集を開きますか？")) return;
    requestSerial++;
    if (!formArea.contains(document.activeElement)) restoreFocus = document.activeElement;
    const spec = categories[entity];
    let formSha = input.sha || catalog.sha;
    const form = el("form");
    form.className = "stack cms-record-form";
    const basic = el("section");
    basic.className = "cms-form-section";
    basic.append(el("h4", "基本情報"));
    const basicGrid = el("div");
    basicGrid.className = "cms-field-grid";
    basic.append(basicGrid);
    form.append(basic);
    const fields = new Map();
    const relationTargets = { organization: "organization", organizationId: "organization", talent: "talent", productId: "product", campaignId: "campaign", karaokeId: "karaoke", songId: "song" };
    const relationLink = (entity, id) => "#content/" + entity + "?" + new URLSearchParams({ record: id });
    function add(key, label, control, host = form) {
      const wrapping = pickerField(label, control);
      control.setAttribute("aria-label", label);
      control.value = input[key] ?? (["format", "activity"].includes(key) ? "unknown" : key === "kind" ? "birthday" : key === "visibility" ? "public" : "");
      if (control.required) wrapping.dataset.required = "true";
      const field = el("div");
      field.className = "cms-field";
      if (control.matches("textarea,input[type=url]") || ["name", "title", "displayName", "rawLabel", "rawSongTitle"].includes(key)) field.classList.add("wide");
      field.append(wrapping);
      if (relationTargets[key] && view !== "legacy") {
        const link = el("a", "関連レコードを開く");
        link.className = "cms-relation-link";
        const update = () => {
          link.hidden = !control.value;
          if (control.value) link.href = relationLink(relationTargets[key], control.value);
          else link.removeAttribute("href");
        };
        control.addEventListener("change", update);
        update();
        field.append(link);
      }
      if (key === "image" || key === "thumbnailUrl") {
        const preview = el("img");
        preview.className = key === "thumbnailUrl" ? "cms-event-preview" : "cms-form-image";
        preview.alt = "登録画像のプレビュー";
        preview.referrerPolicy = "no-referrer";
        const update = () => {
          preview.hidden = !/^https:\/\//i.test(control.value);
          if (!preview.hidden) preview.src = control.value;
          else preview.removeAttribute("src");
        };
        preview.onerror = () => { preview.hidden = true; };
        control.addEventListener("change", update);
        update();
        field.append(preview);
        if (key === "thumbnailUrl") field.append(el("small", "公式画像など、掲載可能な公開HTTPS画像URLを入力。16:9で表示します。"));
      }
      host.append(field);
      fields.set(key, control);
    }
    function newSongFields(values) {
      const details = el("details");
      details.append(el("summary", "新しい楽曲を同時に登録"));
      details.open = Boolean(values.newSongTitle);
      const controls = {};
      for (const [key, text, type] of [
        ["newSongTitle", "原曲の曲名", "text"],
        ["newSongArtist", "原曲アーティスト", "text"],
        ["newSongUrl", "原曲の公式URL", "url"],
      ]) {
        const control = el("input");
        control.type = type;
        control.value = values[key] || "";
        const label = el("label", text);
        label.append(control);
        details.append(label);
        controls[key] = control;
      }
      return { details, controls };
    }
    const fieldNames = [...spec.fields];
    const fullTalent = entity === "talent" && catalog.contentPolicy === "all-content-v1";
    if (fullTalent) fieldNames.push("twitchUrl", "tiktokUrl", "wikiUrl");
    if (entity === "song" && !input.id) fieldNames.push("songIdentityUrl");
    if (entity === "video" && input.id) fieldNames.push("title");
    for (const key of fieldNames) {

      const [label, type] = labels[key];
      const control = el(["textarea", "select"].includes(type) ? type : "input");
      if (type === "select") control.append(...Object.entries(key === "status" ? { unknown: "不明", on_sale: "販売中", scheduled: "販売予定", ended: "販売終了", sold_out: "売り切れ" } : key === "verification" ? { unreviewed: "未確認", verified: "確認済み", rejected: "対象外" } : key === "videoKind" ? { cover: "歌ってみた", original: "オリジナル", other: "その他" } : key === "activity" ? { unknown: "不明", active: "活動中", hiatus: "休止中", retired: "引退", ended: "活動終了" } : key === "kind" ? { birthday: "誕生日", debut: "デビュー記念日", group: "グループ記念日", other: "その他" } : {
        unknown: "未定・不明", onsite: "会場開催", online: "オンライン", hybrid: "会場とオンライン",
      }).map(([value, text]) => new Option(text, value)));
      else if (type !== "textarea") control.type = type;
      if (entity === "video" && input.id && key === "videoUrl") control.readOnly = true;
      if (entity === "talent" && ["youtubeUrl", "twitchUrl"].includes(key) &&
          input.accounts?.find((account) => account.service === key.slice(0, -3))?.accountId) {
        control.readOnly = true;
        control.title = "固定済みの収集アカウントは高度な管理で確認してください。";
      }
      control.required = ["month", "day"].includes(key) || ["name", "title", "displayName", "rawSongTitle", "rawLabel", "videoUrl", "videoKind"].includes(key) || key === "announcementUrl" || key === "summary" || key === "identityUrl" || key === "songIdentityUrl";
      if (key === "price") {
        control.min = "0";
        control.step = input.currency && input.currency !== "JPY" ? "any" : "1";
      }
      if (key === "fee") {
        control.min = "0";
        control.step = input.feeCurrency && input.feeCurrency !== "JPY" ? "any" : "1";
      }
      add(key, entity === "talent" && key === "image" ? "プロフィール画像URL" : key === "fee" ? "料金（" + (input.feeCurrency || "JPY") + "）" : key === "price" && input.currency ? "価格（" + input.currency + "）" : label, control, basicGrid);
    }
    if (entity !== "organization" && catalog.contentPolicy === "all-content-v1") {
      const visibility = el("select");
      visibility.append(new Option("公開", "public"), new Option("非公開・下書き", "draft"));
      add("visibility", "公開サイトへの掲載状態", visibility, basicGrid);
    }
    const affiliationRows = [];
    let agencyState;
    if (fullTalent) {
      const section = el("fieldset");
      section.className = "cms-affiliation-editor";
      section.append(el("legend", "所属履歴"), el("p", "過去の所属を残したまま、所属状態と期間を編集できます。移籍する場合は現在の所属を終了し、新しい行を追加してください。"));
      agencyState = el("select");
      agencyState.append(new Option("所属あり", "affiliated"), new Option("個人・無所属", "unaffiliated"), new Option("不明", "unknown"));
      agencyState.value = input.agencyState || "unknown";
      agencyState.setAttribute("aria-label", "事務所所属状態");
      const agencyLabel = el("label", "事務所所属状態");
      agencyLabel.append(agencyState);
      section.append(agencyLabel);
      const rows = el("div");
      rows.className = "stack";
      function affiliation(value = {}, existing = false) {
        const row = el("fieldset");
        row.append(el("legend", existing ? "登録済みの所属" : "追加した所属"));
        const org = el("select");
        org.required = true;
        row.append(bindPicker(org, catalog.organizations, value.organizationId, "所属事務所"));
        if (existing) {
          org.disabled = true;
          row.querySelector('input[type="search"]').disabled = true;
        }
        const status = el("select");
        status.append(new Option("現在", "current"), new Option("過去", "former"), new Option("不明", "unknown"));
        status.value = value.status || "former";
        const from = el("input"), to = el("input");
        from.type = to.type = "date";
        from.value = value.from || "";
        to.value = value.to || "";
        for (const [label, field] of [["事務所", org], ["所属状態", status], ["開始日", from], ["終了日", to]]) {
          row.append(pickerField(label, field));
        }
        const entry = { row, org, status, from, to };
        if (!existing) row.append(button("追加した所属を削除", () => {
          affiliationRows.splice(affiliationRows.indexOf(entry), 1);
          row.remove();
        }));
        affiliationRows.push(entry);
        rows.append(row);
      }
      for (const value of input.affiliations || []) affiliation(value, Boolean(input.id));
      section.append(rows, button("所属を追加", () => affiliation()));
      form.append(section);
      if (input.accounts?.length) {
        const accounts = el("details");
        accounts.append(el("summary", "登録済みアカウント・固定ID"));
        for (const account of input.accounts) {
          const row = el("p", account.service + " / " + (account.accountId || "固定ID未登録") + " / " + account.url);
          accounts.append(row);
        }
        form.append(accounts);
      }
    }
    if (!fullTalent && ((!input.id && !["campaign", "song", "video", "organization", "group", "offer", "performance"].includes(entity)) || entity === "talent")) {
      const key = ["talent", "event"].includes(entity) ? "organization" : "talent";
      const choices = key === "organization" ? catalog.organizations : catalog.people;
      const select = el("select");
      select.required = !input.id;
      const label = key === "organization" ? "関連事務所" : "関連する人物";
      form.append(bindPicker(select, choices, input[key], label));
      add(key, label, select);
    }
    for (const [key, label, choices, required] of entity === "group"
      ? [["organizationId", "関連事務所", catalog.organizations, false]]
      : entity === "offer"
        ? [["productId", "商品", catalog.sections.find((row) => row.entity === "product")?.items, true],
          ["campaignId", "キャンペーン", catalog.sections.find((row) => row.entity === "campaign")?.items, false]]
        : entity === "performance"
          ? [["karaokeId", "歌枠", catalog.sections.find((row) => row.entity === "karaoke")?.items, true],
            ["songId", "楽曲", catalog.songs, false]] : []) {
      const select = el("select");
      select.required = required;
      const picker = key === "songId" ? songPicker(select, input[key], label) : bindPicker(select, choices, input[key], label);
      form.append(picker);
      add(key, label, select);
      if (entity === "offer" && input.id) {
        select.disabled = true;
        picker.querySelector("input").disabled = true;
        select.cmsPicker?.syncDisabled();
      }
    }
    const relations = new Map();
    function multiRelation(key, label, choices, initial) {
      const fieldset = el("fieldset");
      fieldset.className = "cms-relation-picker";
      fieldset.append(el("legend", label));
      if (view !== "legacy") {
        const selected = new Set(initial || []);
        relations.set(key, selected);
        const picker = relationPicker({ choices, selected, label, multiple: true,
          onChange: () => fieldset.dispatchEvent(new Event("change", { bubbles: true })),
        });
        fieldset.append(picker);
        form.append(fieldset);
        return selected;
      }
      const search = el("input");
      search.type = "search";
      search.placeholder = "名前またはIDで絞り込む";
      search.setAttribute("aria-label", label + "を検索");
      const summary = el("p");
      summary.className = "cms-relation-summary";
      const rows = el("div");
      rows.className = "cms-relation-options";
      const selected = new Set(initial || []);
      relations.set(key, selected);
      const draw = () => {
        const query = search.value.trim().normalize("NFKC").toLocaleLowerCase("ja");
        const matching = choices.filter((row) => selected.has(row.id) || (row.name + " " + row.id).normalize("NFKC").toLocaleLowerCase("ja").includes(query));
        const shown = [...matching.filter((row) => selected.has(row.id)), ...matching.filter((row) => !selected.has(row.id)).slice(0, 50)];
        summary.textContent = selected.size + "件選択中・候補 " + matching.length + "件" + (matching.length > shown.length ? "（検索で絞り込み）" : "");
        rows.replaceChildren(...shown.map((row) => {
          const label = el("label", row.name);
          const check = el("input");
          check.type = "checkbox";
          check.checked = selected.has(row.id);
          check.onchange = () => {
            if (check.checked) selected.add(row.id); else selected.delete(row.id);
            summary.textContent = selected.size + "件選択中・候補 " + matching.length + "件";
          };
          label.prepend(check);
          return label;
        }));
      };
      search.addEventListener("input", draw);
      fieldset.append(search, summary, rows);
      form.append(fieldset);
      draw();
      return selected;
    }
    if (catalog.contentPolicy === "all-content-v1" && (input.id || draftId)) {
      if (["anniversary", "product", "musicVideo", "karaoke"].includes(entity))
        multiRelation("talentIds", "関連する人物", catalog.people, input.talentIds);
      if (["anniversary", "product", "event"].includes(entity))
        multiRelation("groupIds", "関連グループ", (catalog.sections.find((row) => row.entity === "group")?.items || []).map(({ id, title }) => ({ id, name: title })), input.groupIds);
      if (entity === "event") {
        multiRelation("organizerIds", "主催事務所", catalog.organizations, input.organizerIds);
        multiRelation("relatedOrganizationIds", "関連事務所", catalog.organizations, input.relatedOrganizationIds);
      }
    }
    if (["group", "performance"].includes(entity))
      multiRelation("talentIds", entity === "group" ? "所属メンバー" : "歌唱者", catalog.people, input.talentIds);
    if (entity === "product" && !input.id) {
      const campaigns = catalog.sections.find(({ entity }) => entity === "campaign")?.items || [];
      const select = el("select");
      form.append(bindPicker(select, campaigns, input.campaignId, "キャンペーン", "キャンペーンなし／新規"));
      add("campaignId", "既存キャンペーン（任意）", select);
      add("campaignTitle", "新しいキャンペーン名（任意）", el("input"));
    }
    function saleEditor(initial, productId, chooseCampaign) {
      const sales = [];
      const fieldset = el("fieldset");
      fieldset.append(el("legend", "販売情報"));
      const rows = el("div");
      function appendSale(value = {}) {
        const row = el("fieldset");
        row.append(el("legend", value.id ? "既存の販売枠" : "新しい販売枠"));
        const controls = {};
        const key = value.key || ((chooseCampaign ? "cms-sale-" : "") + (value.id || crypto.randomUUID().slice(0, 12)));
        const addSaleField = (name, text, control) => {
          control.value = value[name] || "";
          row.append(pickerField(text, control));
          controls[name] = control;
        };
        for (const name of ["url", "price", "startsAt", "endsAt"]) {
          const [text, type] = labels[name];
          const control = el("input");
          control.type = type;
          control.required = name === "url";
          if (name === "price") {
            control.min = "0";
            control.step = value.currency && value.currency !== "JPY" ? "any" : "1";
          }
          addSaleField(name, name === "price" ? "価格（" + (value.currency || "JPY") + "）" : text, control);
        }
        if (chooseCampaign && productId && !value.id) {
          const campaign = el("select");
          row.append(bindPicker(campaign, catalog.sections.find(({ entity }) => entity === "campaign")?.items, value.campaignId, "関連キャンペーン", "キャンペーンなし"));
          addSaleField("campaignId", "関連キャンペーン", campaign);
        }
        const sale = { row, id: value.id, key, controls };
        if (!value.id) row.append(button("追加した販売枠を削除", () => {
          sales.splice(sales.indexOf(sale), 1);
          row.remove();
        }));
        sales.push(sale);
        rows.append(row);
        return controls.url;
      }
      for (const sale of initial) appendSale(sale);
      fieldset.append(rows, button("販売枠を追加", () => appendSale().focus()));
      return { fieldset, add: appendSale, read: () => sales.map(({ id, key, controls }) => ({
        id, key, ...Object.fromEntries(Object.entries(controls).map(([name, control]) => [name, control.value])),
      })) };
    }
    const productSales = entity === "product" ? saleEditor(input.sales || [], input.id, true) : null;
    if (productSales) form.append(productSales.fieldset);
    const products = [];
    if (entity === "campaign") {
      const group = el("fieldset");
      group.append(el("legend", "商品と販売情報"));
      const rows = el("div");
      function appendProduct(value = {}) {
        const row = el("fieldset");
        row.append(el("legend", value.id ? value.title : "新しい商品"));
        const controls = new Map();
        function field(name, text, control, required = false) {
          control.setAttribute("aria-label", text);
          control.value = value[name] || "";
          control.required = required;
          row.append(pickerField(text, control));
          controls.set(name, control);
        }
        for (const name of ["title", "identityUrl", "image"]) {
          const control = el("input");
          control.type = labels[name][1];
          field(name, name === "title" ? "商品名" : labels[name][0], control, name !== "image");
        }
        if (!value.id) {
          const select = el("select");
          row.append(bindPicker(select, catalog.people, value.talent, "関連する人物"));
          field("talent", "関連する人物", select, true);
        }
        const editor = saleEditor(value.sales || [], value.id, false);
        if (!value.id && !value.sales?.length) editor.add();
        row.append(editor.fieldset);
        const product = { value, controls, editor, key: value.key || value.id || crypto.randomUUID().slice(0, 12) };
        if (!value.id) row.append(button("追加した商品を削除", () => {
          products.splice(products.indexOf(product), 1);
          row.remove();
        }));
        products.push(product);
        rows.append(row);
        controls.get("title").focus();
      }
      for (const product of input.products || []) appendProduct(product);
      if (!input.id && !products.length) appendProduct();
      group.append(rows, button("商品を追加", () => appendProduct()));
      form.append(group);
    }
    if (entity === "musicVideo") {
      const select = el("select");
      form.append(songPicker(select, input.songId));
      add("songId", "既存の楽曲", select);
      const {details, controls} = newSongFields(input);
      for (const [key, control] of Object.entries(controls)) fields.set(key, control);
      form.append(details);
    }
    if (entity === "event") multiRelation("performers", "出演者", catalog.people, input.performers);

    const tracks = [];
    const complete = el("input");
    complete.type = "checkbox";
    complete.checked = input.complete === true;
    if (entity === "karaoke") {
      const fieldset = el("fieldset");
      fieldset.append(el("legend", "セットリスト"));
      const rows = el("ol");
      function appendTrack(track = {}) {
        const row = el("li");
        const title = el("input");
        title.required = true;
        title.value = track.label || "";
        const label = el("label", "配信内の曲名");
        label.append(title);
        const song = el("select");
        const songSearch = songPicker(song, track.songId);
        const songLabel = pickerField("既存の楽曲", song);
        const move = (offset) => {
          const index = tracks.findIndex((item) => item.row === row);
          const next = index + offset;
          if (next < 0 || next >= tracks.length) return;
          [tracks[index], tracks[next]] = [tracks[next], tracks[index]];
          rows.replaceChildren(...tracks.map((item) => item.row));
          row.querySelector("button").focus();
        };
        const times = ["開始時刻（秒）", "終了時刻（秒）"].map((name, index) => {
          const field = el("label", name);
          const control = el("input");
          control.type = "number";
          control.min = "0";
          control.value = track[index ? "endsAtSeconds" : "startsAtSeconds"] || "";
          field.append(control);
          return { field, control };
        });
        const work = newSongFields(track);
        row.append(label, ...(song.cmsPicker ? [] : [songSearch]), songLabel, work.details, ...times.map(({ field }) => field), button("上へ", () => move(-1)), button("下へ", () => move(1)));
        if (!track.id) row.append(button("追加行を取り除く", () => {
          tracks.splice(tracks.findIndex((item) => item.row === row), 1);
          row.remove();
        }));
        tracks.push({ row, title, song, id: track.id, times, work: work.controls,
          key: track.key || crypto.randomUUID().replaceAll("-", "").slice(0, 16) });
        rows.append(row);
        return title;
      }
      for (const track of input.setlist || []) appendTrack(track);
      const completeLabel = el("label", "セットリスト全曲を確認済み");
      completeLabel.prepend(complete);
      fieldset.append(rows, button("曲を追加", () => appendTrack().focus()), completeLabel);
      form.append(fieldset);
    }
    if (["musicVideo", "karaoke", "performance"].includes(entity)) {
      const help = el("section");
      help.className = "cms-song-help";
      const note = el("p", "楽曲はID発行済みの登録情報から選択します。別途保存した未公開の新規下書きは、先に公開してから候補を更新してください。歌動画・歌枠では同じフォームで新しい楽曲を同時登録することもできます。");
      const pending = (saved?.drafts || []).filter(({ input, conflict, reapplyJobId }) => input?.entity === "song" && !input.id && !conflict && !reapplyJobId);
      if (pending.length) {
        const list = el("p", "未発行の楽曲下書き：" + pending.map(({ input }) => input.title).join("、"));
        help.append(list);
      }
      const draftLink = el("a", "楽曲の下書きを確認");
      draftLink.href = "#drafts";
      const refreshStatus = el("small");
      refreshStatus.setAttribute("role", "status");
      const refresh = button("最新の楽曲候補を取得", async () => {
        if (saving) return;
        refresh.disabled = true;
        try {
          const latest = await api("/api/cms/catalog?fresh=1");
          if (!form.isConnected) return;
          if (latest.contentPolicy !== catalog.contentPolicy || latest.editable !== catalog.editable) {
            refreshStatus.textContent = "権限が変わりました。入力を控えてから画面を開き直してください。";
            return;
          }
          catalog.songs = latest.songs;
          for (const picker of form.querySelectorAll(".cms-song-picker")) picker.refreshChoices(latest.songs);
          // A new unsaved record has no original record to overwrite. Existing
          // records/drafts retain their base SHA and normal conflict checks.
          if (!input.id && !draftId) formSha = latest.sha;
          refreshStatus.textContent = latest.sha === formSha ? "最新の楽曲候補に更新しました。" :
            "候補を更新しました。既存レコードの保存には最新データで開き直す必要があります。";
        } catch {
          refreshStatus.textContent = "候補を取得できませんでした。入力は保持しています。";
        } finally { refresh.disabled = false; }
      });
      refresh.dataset.pickerNavigation = "";
      if (catalog.editable) help.append(note, draftLink, refresh, refreshStatus);
      else help.append(note);
      form.prepend(help);
    }
    const submit = el("button", "下書きを保存");
    submit.type = "submit";
    submit.className = "primary";
    submit.disabled = !saveAvailable;
    const footer = el("div");
    footer.className = "cms-editor-footer";
    const saveStatus = el("span", catalog.editable ? draftId ? "保存済みの下書き" : "未変更" : "閲覧専用");
    saveStatus.setAttribute("role", "status");
    saveStatus.className = "cms-save-status";
    footer.append(saveStatus, submit);
    if (catalog.editable && view !== "legacy") {
      const draftsLink = el("a", "下書きへ");
      draftsLink.href = "#drafts";
      footer.append(draftsLink);
    }
    form.append(footer);
    form.addEventListener("invalid", (event) => {
      const control = event.target;
      const label = control.closest("label");
      if (!label) return;
      let message = label.querySelector(".cms-field-error");
      if (!message) {
        message = el("small");
        message.className = "cms-field-error";
        label.append(message);
      }
      message.textContent = control.validationMessage;
      control.setAttribute("aria-invalid", "true");
    }, true);
    let inputRevision = 0;
    const markDirty = (event) => {
      if (!catalog.editable || event?.target?.matches("input[type=search]")) return;
      event?.target?.removeAttribute("aria-invalid");
      event?.target?.closest("label")?.querySelector(".cms-field-error")?.remove();
      inputRevision++;
      panel.dataset.cmsDirty = "true";
      saveStatus.textContent = "未保存の変更";
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("click", (event) => {
      if (event.target.closest('button[type="button"]:not([data-picker-navigation])')) markDirty();
    });
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!catalog.editable || saving || !saveAvailable) return;
      const submittedInputRevision = inputRevision;
      saving = true;
      panel.dataset.cmsSaving = "true";
      saveStatus.textContent = "保存中…";
      submit.disabled = true;
      try {
        const values = Object.fromEntries([...fields].map(([key, control]) => [key, control.value]));
        for (const [key, ids] of relations) values[key] = [...ids];
        if (fullTalent) {
          values.agencyState = agencyState.value;
          values.affiliations = affiliationRows.map(({ org, status, from, to }) => ({
            organizationId: org.value, status: status.value, from: from.value || null, to: to.value || null,
          }));
        }
        if (entity === "karaoke") {
          values.complete = complete.checked;
          values.setlist = tracks.map(({ id, key, title, song, times, work }) => ({
            ...Object.fromEntries(Object.entries(work).map(([name, control]) => [name, control.value])),
            ...(id ? { id } : {}), key, label: title.value, songId: song.value,
            startsAtSeconds: times[0].control.value, endsAtSeconds: times[1].control.value,
          }));
        }
        if (productSales) values.sales = productSales.read();
        if (entity === "campaign") values.products = products.map(({ value, key, controls, editor }) => ({
          id: value.id, key, sales: editor.read(),
          ...Object.fromEntries([...controls].map(([name, control]) => [name, control.value])),
        }));
        const result = await api("/api/cms/draft", "PUT", {
          entity, id: input.id, draftId, sha: formSha, revision, ...values,
        });
        revision = result.revision;
        draftId = result.draftId;
        formArea.dataset.draftId = draftId;
        if (inputRevision === submittedInputRevision) {
          delete panel.dataset.cmsDirty;
          saveStatus.textContent = "保存済み";
        } else saveStatus.textContent = "未保存の変更";
        try {
          await refreshDrafts();
          status.textContent = "下書きを保存しました。公開サイトには反映されていません。";
        } catch {
          saveAvailable = false;
          status.textContent = "下書きは保存されましたが一覧の再取得に失敗しました。再読み込みしてから編集を続けてください。";
          saveStatus.textContent = "保存済み・再読み込みが必要";
        }
      } catch (error) {
        panel.dataset.cmsDirty = "true";
        const authExpired = ["login_required", "invalid_session", "github_401", "csrf_rejected"].includes(error.code || error.message);
        saveStatus.textContent = authExpired ? "再ログインが必要・入力保持" : "保存失敗・入力保持";
        status.textContent = authExpired
          ? "このタブを閉じず、上の再ログイン案内から認証を確認してから、もう一度下書きを保存してください。"
          : ["main_changed_reload", "workspace_revision_conflict"].includes(error.message)
          ? "別の更新がありました。入力を控えてから画面を開き直してください。"
          : error.message === "cms_identity_anchor" ? "固定済みの収集アカウントはこの画面から変更できません。"
          : error.message === "affiliation_history_must_be_retained" ? "過去の所属を削除することはできません。"
          : "保存できませんでした。入力内容と関連レコードの整合性を確認してください。";
      } finally {
        saving = false;
        delete panel.dataset.cmsSaving;
        submit.disabled = !saveAvailable;
      }
    };
    delete panel.dataset.cmsDirty;
    formArea.dataset.draftId = draftId || "";
    if (!catalog.editable) {
      for (const control of form.querySelectorAll("input,select,textarea,button")) control.disabled = true;
      submit.hidden = true;
    }
    const heading = el("div");
    heading.className = "cms-editor-heading";
    const title = el("h3", spec.label + (catalog.editable ? input.id ? "を編集" : "を登録" : "の詳細"));
    title.tabIndex = -1;
    heading.append(title);
    if (input.id) heading.append(el("small", input.id));
    heading.append(button("閉じる", () => closeEditor()));
    if (view !== "legacy") {
      const body = el("div");
      body.className = "cms-form-scroll stack";
      for (const child of [...form.children]) if (child !== footer) body.append(child);
      form.prepend(body);
    }
    formArea.replaceChildren(heading, form);
    formArea.hidden = false;
    workspaceArea.classList.add("has-editor");
    (form.querySelector("input:not(:disabled):not([hidden]), textarea:not(:disabled), select:not(:disabled):not([hidden])") || title).focus({ preventScroll: true });
  }
  if (saved) await refreshDrafts(true);
  if (["legacy", "history"].includes(view)) {
    const history = mountCmsHistory({ api, editable: catalog.editable, revision: () => revision, afterSave: refreshDrafts });
    history.open = view === "history";
    panel.append(history);
  }
  if (view === "dashboard") {
    const shortcuts = el("div");
    shortcuts.className = "cms-dashboard-collections";
    const intro = el("p", "編集するコレクションを選択してください。変更は下書きに保存され、確認・検証後に公開されます。");
    const summary = el("div");
    summary.className = "cms-dashboard-summary";
    if (catalog.editable && saved) {
      for (const [label, count, route] of [
        ["保存済みの下書き", saved.drafts.length, "#drafts"],
        ["要確認の下書き", saved.drafts.filter((item) => item.conflict || item.reapplyJobId).length, "#drafts"],
      ]) {
        const link = el("a");
        link.href = route;
        link.append(el("span", label), el("strong", String(count)));
        summary.append(link);
      }
    }
    const heading = el("h3", "コレクション");
    for (const { entity, label, items } of catalog.sections) {
      const link = el("a");
      link.href = "#content/" + entity;
      link.append(el("strong", label), el("span", items.length + "件"));
      shortcuts.append(link);
    }
    panel.insertBefore(intro, draftsArea);
    if (summary.childElementCount) panel.insertBefore(summary, draftsArea);
    panel.append(heading, shortcuts);
  }
  if (!browsing) {
    if (saveAvailable) status.textContent = "";
    return;
  }
  const actions = el("div");
  actions.className = "cms-collection-actions";
  if (view !== "legacy") {
    const title = panel.querySelector("h2");
    if (title) {
      const heading = el("div");
      heading.className = "cms-page-heading";
      title.before(heading);
      heading.append(title, actions);
    } else list.append(actions);
  } else list.append(actions);
  for (const [entity, spec] of Object.entries(categories)) {
    if (["legacy", "content"].includes(view) && (!selectedEntity || selectedEntity === entity) && (!spec.ownerCreate || catalog.owner || catalog.contentPolicy === "all-content-v1") && catalog.editable && catalog.categories.includes(spec.category))
      {
        const create = button(spec.label + "を新規登録", () => edit(entity));
        create.className = "primary cms-create";
        actions.append(create);
      }
  }
  const stateLabels = {
    public: "公開", private: "非公開", draft: "非公開・下書き",
    active: "活動中", hiatus: "活動休止", retired: "引退", ended: "終了",
    on_sale: "販売中", scheduled: "予定", sold_out: "売り切れ", unknown: "不明",
    verified: "確認済み", unreviewed: "未確認", rejected: "対象外",
    complete: "確認完了", partial: "一部確認", unavailable: "利用不可",
    unlisted: "限定公開", cancelled: "中止", postponed: "延期",
  };
  const translated = (value) => value ? stateLabels[value] || value : "—";
  const normal = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja");
  const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const formatDate = (value) => !value ? "" : /T\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : value;
  const columns = [
    ["title", "名称"], ["context", "関連情報"], ["date", "日時"],
    ["state", "状態"], ["visibility", "公開状態"], ["draft", "下書き"], ["id", "固定ID"],
  ];
  const hasValue = (key) => sections.some(({ items }) => items.some((item) => Boolean(item[key])));
  const compactViewport = matchMedia("(max-width: 767px)").matches;
  const activeColumns = new Set(compactViewport ? ["title", "visibility", ...["state"].filter(hasValue)] :
    ["title", "visibility", "draft", "id", ...["context", "date", "state"].filter(hasValue)]);
  const bulkAvailable = view === "content" && selectedEntity !== "organization" &&
    catalog.editable && catalog.contentPolicy === "all-content-v1";
  const selectedRows = new Set();
  const bulkBar = el("div");
  bulkBar.className = "cms-bulk-bar";
  const bulkCount = el("span");
  bulkCount.setAttribute("role", "status");
  const bulkField = el("select");
  bulkField.setAttribute("aria-label", "一括編集する項目");
  bulkField.append(new Option("掲載状態", "visibility"));
  if (selectedEntity === "talent") bulkField.append(new Option("活動状態", "activity"));
  if (selectedEntity === "performance") bulkField.append(new Option("確認状態", "verification"));
  const bulkValue = el("select");
  bulkValue.setAttribute("aria-label", "一括編集の変更後の値");
  const bulkValues = { visibility: ["public", "draft"], activity: ["active", "hiatus", "retired", "ended", "unknown"], verification: ["verified", "unreviewed", "rejected"] };
  const populateBulk = () => bulkValue.replaceChildren(...bulkValues[bulkField.value].map((value) => new Option(translated(value), value)));
  populateBulk();
  bulkField.onchange = populateBulk;
  const bulkSave = button("一括で下書きを保存", async () => {
    if (!saveAvailable || saving || !selectedRows.size || selectedRows.size > 12) return;
    if (panel.dataset.cmsDirty) { status.textContent = "編集中のレコードを保存または閉じてから一括編集してください。"; return; }
    if (!confirm(selectedRows.size + "件の「" + bulkField.selectedOptions[0].text + "」を「" + bulkValue.selectedOptions[0].text + "」に変更し、下書きとして保存します。公開は別途確認が必要です。")) return;
    if (!formArea.hidden) closeEditor(true);
    saving = true;
    panel.dataset.cmsSaving = "true";
    filter();
    bulkSave.disabled = true;
    try {
      const result = await api("/api/cms/draft/bulk", "PUT", { entity: selectedEntity, ids: [...selectedRows], field: bulkField.value, value: bulkValue.value, revision, sha: catalog.sha });
      revision = result.revision;
      selectedRows.clear();
      try { await refreshDrafts(); status.textContent = result.draftIds.length + "件の下書きを保存しました。"; }
      catch { saveAvailable = false; status.textContent = "保存済みですが一覧の再取得に失敗しました。再読み込みしてください。"; }
    } catch (error) {
      status.textContent = error.message === "cms_bulk_existing_draft" ? "対象に既存の下書きがあるため保存していません。" : error.message === "no_changes" ? "変更する項目はありません。" : "一括保存できませんでした。変更は反映されていません。";
    } finally { saving = false; delete panel.dataset.cmsSaving; filter(); }
  });
  bulkSave.className = "primary";
  const clearBulk = button("選択解除", () => { selectedRows.clear(); filter(); });
  const updateBulk = () => {
    bulkBar.hidden = selectedRows.size === 0;
    bulkCount.textContent = selectedRows.size + "件選択中（最大12件）";
    bulkSave.disabled = saving || !saveAvailable || !selectedRows.size || selectedRows.size > 12;
    clearBulk.disabled = saving || !selectedRows.size;
  };
  bulkBar.append(bulkCount, bulkField, bulkValue, bulkSave, clearBulk);
  if (bulkAvailable) {
    bulkBar.hidden = true;
    list.append(bulkBar);
  }
  const tools = el("div");
  tools.className = "cms-toolbar cms-collection-toolbar";
  const category = el("select");
  const search = el("input");
  const order = el("select");
  const visibility = el("select");
  const state = el("select");
  const draftFilter = el("select");
  search.type = "search";
  search.placeholder = "名称・ID・関連情報を検索";
  search.setAttribute("aria-label", "名称を検索");
  category.setAttribute("aria-label", "コンテンツの種類");
  order.setAttribute("aria-label", "並び順");
  visibility.setAttribute("aria-label", "公開状態で絞り込む");
  state.setAttribute("aria-label", "状態で絞り込む");
  draftFilter.setAttribute("aria-label", "下書きで絞り込む");
  category.append(new Option("すべての種類", ""), ...sections.map(({ entity, label }) => new Option(label, entity)));
  order.append(new Option("登録順", ""), new Option("名前順", "name"), new Option("名前順（降順）", "name-desc"), new Option("固定ID順", "id"));
  visibility.append(new Option("公開状態：すべて", ""), ...[...new Set(sections.flatMap(({ items }) => items.map((row) => row.visibility).filter(Boolean)))].map((value) => new Option(translated(value), value)));
  state.append(new Option("状態：すべて", ""), ...[...new Set(sections.flatMap(({ items }) => items.map((row) => row.state).filter(Boolean)))].map((value) => new Option(translated(value), value)));
  draftFilter.append(new Option("下書き：すべて", ""), new Option("下書きあり", "yes"), new Option("下書きなし", "no"));
  category.hidden = Boolean(selectedEntity);
  state.hidden = state.options.length <= 1;
  draftFilter.hidden = !catalog.editable;
  const columnMenu = el("details");
  columnMenu.className = "cms-columns";
  columnMenu.append(el("summary", "表示列"));
  for (const [key, label] of columns.slice(1)) {
    const control = el("input");
    control.type = "checkbox";
    control.checked = activeColumns.has(key);
    control.onchange = () => {
      if (control.checked) activeColumns.add(key); else activeColumns.delete(key);
      filter();
    };
    const wrapping = el("label", label);
    wrapping.prepend(control);
    columnMenu.append(wrapping);
  }
  tools.append(category, search, visibility, state, draftFilter, order, columnMenu);
  list.append(tools);
  const views = [];
  const collator = new Intl.Collator("ja");
  let page = 0;
  const pageSize = 50;
  const paging = el("div");
  paging.className = "cms-toolbar cms-paging";
  const count = el("p");
  count.setAttribute("aria-live", "polite");
  const previous = button("前のページ", () => { page--; filter(); });
  const next = button("次のページ", () => { page++; filter(); });
  paging.append(count, previous, next);
  async function openRecord(entity, id) {
    if (saving) return;
    const request = ++requestSerial;
    const draft = saved?.drafts.find(({ input }) => input?.entity === entity && input.id === id);
    if (draft?.conflict || draft?.reapplyJobId) {
      status.textContent = "このレコードには確認が必要な下書きがあります。「下書き」から比較・再適用してください。";
      return;
    }
    if (draft?.input) {
      edit(entity, draft.input, draft.draftId);
      return;
    }
    try {
      const query = new URLSearchParams({ entity, id });
      const { fields, sha } = await api("/api/cms/detail?" + query);
      if (panel.isConnected && request === requestSerial) edit(entity, { ...fields, id, sha });
    } catch {
      status.textContent = "この項目の詳細を取得できませんでした。";
    }
  }
  const makeRow = (entity, item, draft) => {
    const row = el("tr");
    if (bulkAvailable) {
      const cell = el("td");
      const check = el("input");
      check.type = "checkbox";
      check.setAttribute("aria-label", item.title + "を一括編集の対象にする");
      check.checked = selectedRows.has(item.id);
      check.disabled = Boolean(draft) || saving || (!check.checked && selectedRows.size >= 12);
      check.onchange = () => {
        if (check.checked) selectedRows.add(item.id); else selectedRows.delete(item.id);
        filter();
        const replacement = [...list.querySelectorAll('input[type="checkbox"]')].find((node) => node.getAttribute("aria-label") === check.getAttribute("aria-label"));
        replacement?.focus();
      };
      cell.className = "cms-select-cell";
      cell.append(check);
      row.append(cell);
    }
    for (const [key] of columns.filter(([key]) => activeColumns.has(key))) {
      const cell = el("td");
      cell.dataset.column = key;
      if (key === "title") {
        const title = button(item.title || item.id, () => openRecord(entity, item.id));
        title.className = "cms-record-link";
        if (item.image && /^https:\/\//i.test(item.image)) {
          const image = el("img");
          image.src = item.image;
          image.alt = "";
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          image.className = "cms-record-image";
          image.onerror = () => image.remove();
          title.prepend(image);
        }
        cell.append(title);
      } else if (key === "visibility" || key === "state") {
        const tag = el("span", translated(item[key]));
        tag.className = "cms-record-state";
        tag.dataset.state = item[key] || "";
        cell.append(tag);
      } else if (key === "draft") {
        cell.textContent = draft ? draft.conflict ? "要確認" : "下書きあり" : "—";
      } else cell.textContent = key === "date" ? formatDate(item.date) || "—" : item[key] || "—";
      row.append(cell);
    }
    return row;
  };
  function filter() {
    const needle = normal(search.value.trim());
    const drafts = new Map((saved?.drafts || []).filter(({ input }) => input?.id).map((draft) => [draft.input.entity + ":" + draft.input.id, draft]));
    let total = 0, longest = 0, offset = 0;
    for (const { entity, section, headerRow, entries, items } of views) {
      const visible = !category.value || category.value === entity;
      section.hidden = !visible;
      if (!visible) { entries.replaceChildren(); continue; }
      const matching = items.filter((item) => {
        const draft = drafts.get(entity + ":" + item.id);
        return normal([item.title, item.id, item.context, item.description, formatDate(item.date)].join(" ")).includes(needle) &&
          (!visibility.value || item.visibility === visibility.value) &&
          (!state.value || item.state === state.value) &&
          (!draftFilter.value || Boolean(draft) === (draftFilter.value === "yes"));
      });
      if (order.value === "name" || order.value === "name-desc") matching.sort((a, b) => collator.compare(a.title || a.id, b.title || b.id) * (order.value === "name-desc" ? -1 : 1));
      if (order.value === "id") matching.sort((a, b) => collator.compare(a.id, b.id));
      total += matching.length;
      longest = Math.max(longest, matching.length);
      // Search pages have one global 50-row budget; legacy grouped view retains its separate collections.
      const lower = page * pageSize - (view === "search" ? offset : 0);
      const upper = lower + pageSize;
      offset += matching.length;
      const windowRows = matching.slice(Math.max(0, lower), Math.max(0, upper));
      const shown = columns.filter(([key]) => activeColumns.has(key));
      headerRow.replaceChildren(...shown.map(([key, label]) => { const th = el("th", label); th.scope = "col"; th.dataset.column = key; return th; }));
      if (bulkAvailable) {
        const th = el("th", "選択");
        th.scope = "col";
        headerRow.prepend(th);
      }
      entries.replaceChildren(...windowRows.map((item) => makeRow(entity, item, drafts.get(entity + ":" + item.id))));
      if (view === "search" && !windowRows.length) section.hidden = true;
      else if (!windowRows.length) {
        const empty = el("tr");
        const cell = el("td", "該当するコンテンツはありません。");
        cell.colSpan = shown.length + Number(bulkAvailable);
        empty.append(cell);
        entries.append(empty);
      }
    }
    const max = view === "search" ? total : longest;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= max;
    count.textContent = total + "件 / " + (page + 1) + "ページ";
    if (bulkAvailable) updateBulk();
  }
  const reset = () => { page = 0; filter(); };
  search.addEventListener("input", reset);
  for (const control of [category, visibility, state, draftFilter, order]) control.addEventListener("change", reset);
  for (const { entity, label, items } of sections) {
    const section = el("section");
    section.className = "cms-collection";
    const table = el("table");
    table.className = "cms-table";
    const header = el("thead");
    const headerRow = el("tr");
    header.append(headerRow);
    const entries = el("tbody");
    table.append(header, entries);
    const wrapper = el("div");
    wrapper.className = "cms-table-wrap";
    wrapper.append(table);
    if (view !== "content") section.append(el("h3", label));
    section.append(wrapper);
    list.append(section);
    views.push({ entity, section, headerRow, entries, items });
  }
  list.append(paging);
  refreshList = filter;
  filter();
  if (view === "search") search.focus();
  if (saveAvailable) status.textContent = "";
  if (options.recordId && selectedEntity) {
    if (sections.some(({ items }) => items.some((item) => item.id === options.recordId)))
      await openRecord(selectedEntity, options.recordId);
    else status.textContent = "対象レコードが存在しないか、閲覧権限がありません。";
  }
}
