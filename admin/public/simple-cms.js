import { mountCmsHistory } from "./cms-history.js";
import { renderDraftConflicts } from "./cms-conflicts.js";
import { youtubeId } from "./content-utils.js";
import { parseTransfer, transferFields, editableKeys, pageMetadata, officialUrl } from "./cms-transfer.js";

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
  panel.dataset.cmsView = view;
  const selectedEntity = options.entity;
  // Every workspace starts with the current main ref; the reader still reuses immutable model data.
  const catalog = await api("/api/cms/catalog?fresh=1");
  const goodsView = selectedEntity === "goods";
  const goodsSection = { entity: "goods", category: "goods", label: "グッズ", items: catalog.goodsEntries || [] };
  const mergedSections = catalog.goodsEntries
    ? [...catalog.sections.filter(row => !["product","campaign","offer"].includes(row.entity)),
      ...(catalog.categories.includes("goods") ? [goodsSection] : [])]
    : catalog.sections;
  const sections = goodsView ? [goodsSection] : selectedEntity
    ? catalog.sections.filter(({ entity }) => entity === selectedEntity)
    : view === "legacy" ? catalog.sections : mergedSections;
  const browsing = ["legacy", "content", "search"].includes(view);
  const qualityReasons=(entity,item)=>{const reasons=[];if(["talent","performance","goods","karaoke","event"].includes(entity)&&["unknown","unreviewed","partial","unavailable"].includes(item.state))reasons.push("確認状態が不明・未完了");if(entity==="event"&&!item.date)reasons.push("開催日時が未登録");if(["talent","goods","event"].includes(entity)&&!item.image)reasons.push("画像が未登録");if(entity==="song"&&!item.context)reasons.push("原曲アーティストが未登録");return reasons;};
  const needsReview=(entity,item)=>qualityReasons(entity,item).length>0;
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
    const talentPicker=choices===catalog.people;
    const selectedIds=()=>{const rank=new Map(entries.map((row,i)=>[row.id,i]));return talentPicker?[...selected].sort((a,b)=>(rank.get(a)??Infinity)-(rank.get(b)??Infinity)):[...selected];};
    let matching = [], active = -1, rendered = 0;
    const chunk = 40;
    const isDisabled = () => !catalog.editable || disabled();
    const labelFor = (id) => lookup.get(id)?.name || id + "（現在の参照）";
    function syncChips() {
      chips.replaceChildren(...selectedIds().map(id => {
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
      search.placeholder = selected.size ? multiple ? "さらに追加する" : "別の候補を検索" : label === "曲名・原曲アーティスト" ? "曲名・原曲アーティスト・別名で検索" : "名前・別名・IDで検索";
      search.disabled = isDisabled();
    }
    function close() {
      popup.hidden = true; search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      active = -1;
    }
    function choose(id) {
      if (isDisabled() || !lookup.has(id)) return;
      if (!multiple) selected.clear();
      selected.add(id);
      search.value = "";
      changed();
      search.focus({ preventScroll: true });
      close();
    }
    function changed() {
      syncChips();
      onChange(selectedIds());
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
    const relatedEntity=choices===catalog.people?"talent":choices===catalog.organizations?"organization":choices===catalog.songs?"song":/グループ/.test(label)?"group":/キャンペーン/.test(label)?"campaign":/歌枠/.test(label)?"karaoke":label==="商品"?"product":/楽曲/.test(label)?"song":null;
    if(view!=="legacy"&&catalog.editable&&catalog.contentPolicy==="all-content-v1"&&relatedEntity&&catalog.categories.includes(categories[relatedEntity]?.category)){
      const actions=el("div");actions.className="cms-relation-actions";
      const create=button("＋ 候補を新規作成",()=>{if(!isDisabled())openRelatedCreator(relatedEntity,search.value.trim());});create.dataset.pickerNavigation="";create.className="cms-related-create";
      const refresh=button("候補を更新",async()=>{if(saving||isDisabled())return;refresh.disabled=true;try{const latest=await api("/api/cms/catalog?fresh=1");if(latest.contentPolicy!==catalog.contentPolicy||latest.editable!==catalog.editable)throw Error("権限が変更されました");const rows=relatedEntity==="talent"?latest.people:relatedEntity==="organization"?latest.organizations:relatedEntity==="song"?latest.songs:latest.sections.find(s=>s.entity===relatedEntity)?.items||[];group.refreshChoices(rows);group.dispatchEvent(new CustomEvent("cms-relations-refreshed",{bubbles:true,detail:{sha:latest.sha}}));status.textContent="候補を更新しました。";}catch{status.textContent="候補を更新できませんでした。";}finally{refresh.disabled=false;}});refresh.dataset.pickerNavigation="";
      actions.append(create,refresh);group.append(actions);
    }
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
      control.cmsPicker.querySelector("[role=listbox]").setAttribute("aria-label", label + "の候補");
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
    workspaceArea.classList.remove("has-editor", "cms-editor-expanded");
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
      ["queued", "順番待ち"], ["candidate", "変更準備"], ["checking", "公開前チェック"],
      ["promoting", "データ更新"], ["pages", "サイト反映"], ["published", "完了"],
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
    publishedRecords.replaceChildren(el("summary", "公開したデータ"), list);
    publicationArea.dataset.phase = publication?.phase || "idle";
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
    if (view === "dashboard") draftsArea.hidden = !saved.drafts.length;
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
  // Related drafts are created without dismantling or submitting the parent editor.
  function openRelatedCreator(entity, seed=""){
    if(saving||!saveAvailable||!catalog.editable||catalog.contentPolicy!=="all-content-v1"||panel.querySelector(".cms-related-dialog[open]"))return;
    const spec=categories[entity];const dialog=el("dialog");dialog.className="cms-transfer-dialog cms-related-dialog";dialog.setAttribute("aria-label",spec.label+"を追加");
    const bar=el("div");bar.className="cms-command-bar";const close=button("閉じる",()=>{if(!saving)dialog.close()});bar.append(el("h3",spec.label+"を追加"),close);
    const info=el("p","元の入力は保持されます。関連データを先に下書きとして保存し、公開処理でIDが発行されたら「候補を更新」して選択してください。");
    const form=el("form");form.className="stack";const controls=new Map();
    const titleKey=({organization:"name",group:"name",talent:"displayName",song:"title",campaign:"title",product:"title",karaoke:"videoUrl"})[entity];
    const keys=transferFields[entity].split(" ");
    const required=({organization:["name"],group:["name"],talent:["displayName","officialProfileUrl"],song:["title","artists","songIdentityUrl"],campaign:["title","products"],product:["title","identityUrl","talentIds","sales"],karaoke:["videoUrl","talentIds"]})[entity]||[titleKey];
    const arrayKeys=new Set(["talentIds","groupIds","affiliations","products","sales","setlist"]);
    function addInput(key,host){
      const [label,type]=labels[key]||[({products:"商品一覧（JSON）",sales:"販売情報（JSON）",talentIds:"関連VTuber ID（JSON配列）",groupIds:"関連グループ ID（JSON配列）",organizationId:"所属事務所ID",affiliations:"所属履歴（JSON）",campaignImage:"販売企画画像URL",agencyState:"所属状態",complete:"セットリスト完了"})[key]||key,"text"];
      const node=el(arrayKeys.has(key)||type==="textarea"?"textarea":"input");if(node.tagName==="INPUT")node.type=type==="url"?"url":"text";
      node.value=key===titleKey&&key!=="videoUrl"?seed:key==="visibility"?"public":"";
      node.setAttribute("aria-label",label);node.required=required.includes(key)&&!(entity==="talent"&&key==="officialProfileUrl");
      if(arrayKeys.has(key))node.placeholder='["tal-000001"] または項目のJSON配列';
      controls.set(key,node);host.append(pickerField(label,node));
    }
    for(const key of required.filter(Boolean))addInput(key,form);
    const optional=el("details");optional.append(el("summary","その他の項目"));for(const key of keys.filter(k=>!required.includes(k)))addInput(key,optional);form.append(optional);
    const report=el("p");report.setAttribute("role","status");const submit=el("button","下書きを保存");submit.type="submit";submit.className="primary";form.append(report,submit);
    form.onsubmit=async event=>{event.preventDefault();if(saving||!saveAvailable)return;let rows;try{const row=Object.fromEntries([...controls].filter(([key,c])=>c.value.trim()||required.includes(key)).map(([key,c])=>[key,c.value]));rows=parseTransfer(JSON.stringify([row]),"json",entity,"create");}catch(error){report.textContent=error.message;return;}
      saving=true;panel.dataset.cmsSaving="true";submit.disabled=true;close.disabled=true;
      try{const result=await api("/api/cms/transfer","PUT",{entity,mode:"create",rows,revision,sha:catalog.sha});revision=result.revision;report.textContent="関連データの下書きを保存しました。";try{await refreshDrafts();}catch{saveAvailable=false;report.textContent+=" 再読み込みが必要です。";}submit.hidden=true;status.textContent="関連データを下書きに保存しました。元の入力は保持されています。";}
      catch(error){report.textContent="保存できませんでした："+error.message;}finally{saving=false;delete panel.dataset.cmsSaving;submit.disabled=false;close.disabled=false;}};
    dialog.addEventListener("cancel",event=>{if(saving)event.preventDefault()});dialog.addEventListener("close",()=>dialog.remove());dialog.append(bar,info,form);panel.append(dialog);dialog.showModal();controls.get(titleKey)?.focus();
  }
  function edit(entity, input = {}, draftId, forceUnified = false) {
    if (saving || !panel.isConnected || !Object.hasOwn(categories, entity)) return;
    if (panel.dataset.cmsDirty && !confirm("保存していない入力を破棄して別の編集を開きますか？")) return;
    requestSerial++;
    if (!formArea.contains(document.activeElement)) restoreFocus = document.activeElement;
    const spec = categories[entity];
    const unifiedGoods = view !== "legacy" && ["product","campaign"].includes(entity) &&
      !(entity === "product" && !input.id && (input.campaignTitle || input.campaignId)) &&
      (forceUnified || goodsView || view === "drafts" || view === "search" || input.sales?.some(s=>s.saleMode) || input.products?.some(p=>p.sales?.some(s=>s.saleMode)));
    let formSha = input.sha || catalog.sha;
    const form = el("form");
    form.addEventListener("cms-relations-refreshed",event=>{if(!input.id&&!draftId)formSha=event.detail.sha;else if(formSha!==event.detail.sha)status.textContent="候補を更新しました。元データの更新があった場合は保存時に競合確認が必要です。";});
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
    function connectNewSong(select, details, controls) {
      if(view==="legacy"||!catalog.editable||!select.cmsPicker)return;
      const picker=select.cmsPicker, search=picker.querySelector("input[type=search]");
      picker.querySelector(".cms-related-create")?.remove();
      const create=button("候補にない楽曲を登録",()=>{
        if(select.value)return;
        if(!controls.newSongTitle.value)controls.newSongTitle.value=search.value.trim();
        details.open=true;controls.newSongTitle.dispatchEvent(new Event("input",{bubbles:true}));controls.newSongTitle.focus();
      });create.className="cms-relation-create";create.dataset.pickerNavigation="";
      const sync=()=>{create.hidden=Boolean(select.value)||!search.value.trim()||Boolean(picker.querySelector("[role=option]"));};
      search.addEventListener("input",sync);select.addEventListener("change",sync);create.hidden=true;picker.append(create);
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
    // Keep the fields required for the task in view; optional metadata remains available.
    const optionalGroups = entity === "talent" ? { image:"プロフィール・画像", officialProfileUrl:"プロフィール・画像", aliasNames:"別名・補足", youtubeUrl:"SNS・公式リンク", xUrl:"SNS・公式リンク", twitchUrl:"SNS・公式リンク", tiktokUrl:"SNS・公式リンク", wikiUrl:"SNS・公式リンク" } : entity === "song" ? { aliases:"別名・読み", readings:"別名・読み" } : entity === "event" ? { thumbnailUrl:"画像・配信・料金", streamUrl:"画像・配信・料金", fee:"画像・配信・料金" } : {};
    const extraGroups = new Map();
    const fieldHost = key => {
      if (view === "legacy" || !optionalGroups[key]) return basicGrid;
      const label = optionalGroups[key];
      if (!extraGroups.has(label)) {
        const details = el("details"); details.className = "cms-optional-fields";
        const grid = el("div"); grid.className = "cms-field-grid";
        details.append(el("summary", label), grid); extraGroups.set(label, {details, grid});
      }
      return extraGroups.get(label).grid;
    };
    for (const key of fieldNames) {
      const [label, type] = labels[key];
      const control = el(["textarea", "select"].includes(type) ? type : "input");
      if (type === "select") control.append(...Object.entries(key === "status" ? { unknown: "不明", on_sale: "販売中", scheduled: "販売予定", ended: "販売終了", sold_out: "売り切れ" } : key === "verification" ? { unreviewed: "未確認", verified: "確認済み", rejected: "対象外" } : key === "videoKind" ? { original: "オリジナル", cover: "歌ってみた", collaboration: "コラボ楽曲", other: "その他" } : key === "activity" ? { unknown: "不明", active: "活動中", hiatus: "休止中", retired: "引退", ended: "活動終了" } : key === "kind" ? { birthday: "誕生日", debut: "デビュー記念日", group: "グループ記念日", other: "その他" } : {
        unknown: "未定・不明", onsite: "会場開催", online: "オンライン", hybrid: "会場とオンライン",
      }).map(([value, text]) => new Option(text, value)));
      else if (type !== "textarea") control.type = type;
      if (entity === "video" && input.id && key === "videoUrl") control.readOnly = true;
      if (entity === "talent" && ["youtubeUrl", "twitchUrl"].includes(key) &&
          input.accounts?.find((account) => account.service === key.slice(0, -3))?.accountId) {
        control.readOnly = true;
        control.title = "固定済みの収集アカウントは高度な管理で確認してください。";
      }
      control.required = ["month", "day"].includes(key) || ["name", "title", "displayName", "rawSongTitle", "rawLabel", "videoUrl", "videoKind"].includes(key) || key === "announcementUrl" || key === "summary" || (key === "identityUrl" && !unifiedGoods) || key === "songIdentityUrl";
      if (key === "price") {
        control.min = "0";
        control.step = input.currency && input.currency !== "JPY" ? "any" : "1";
      }
      if (key === "fee") {
        control.min = "0";
        control.step = input.feeCurrency && input.feeCurrency !== "JPY" ? "any" : "1";
      }
      add(key, entity === "talent" && key === "image" ? "プロフィール画像URL" : key === "fee" ? "料金（" + (input.feeCurrency || "JPY") + "）" : key === "price" && input.currency ? "価格（" + input.currency + "）" : label, control, fieldHost(key));
    }
    if (entity !== "organization" && catalog.contentPolicy === "all-content-v1") {
      const visibility = el("select");
      visibility.append(new Option("公開", "public"), new Option("非公開・下書き", "draft"));
      // Saving a draft never publishes it. Keep the existing target visibility default.
      add("visibility", "公開サイトへの掲載状態", visibility, basicGrid);
    }
    const affiliationRows = [];
    let agencyState;
    if (fullTalent) {
      const section = el("fieldset");
      section.className = "cms-affiliation-editor";
      section.append(el("legend", "所属・所属履歴"), el("p", "現在・過去の所属を登録できます。卒業・移籍した事務所は削除せず「所属終了」にしてください。"));
      agencyState = el("select");
      agencyState.append(new Option("所属中", "affiliated"), new Option("現在の所属なし", "unaffiliated"), new Option("未確認", "unknown"));
      agencyState.value = input.agencyState || "unknown";
      agencyState.setAttribute("aria-label", "現在の所属状況");
      const agencyLabel = el("label", "現在の所属状況");
      agencyLabel.append(agencyState);
      const agencyHint=el("small");agencyHint.className="cms-agency-hint";
      const rows = el("div");
      rows.className = "stack";
      function syncAgency(){
        const current=affiliationRows.some(r=>r.org.value&&r.status.value==="current");
        const former=affiliationRows.some(r=>r.org.value&&r.status.value==="former");
        const ended=["ended","retired"].includes(fields.get("activity")?.value);
        agencyState.options[0].disabled=!current;
        agencyState.options[1].disabled=agencyState.options[2].disabled=current;
        agencyState.options[1].text=former&&ended?"所属終了（現在の所属なし）":"現在の所属なし";
        if(current)agencyState.value="affiliated";
        else if(agencyState.value==="affiliated"||!agencyState.value)agencyState.value="unknown";
        agencyHint.textContent=current?"所属中の履歴から自動設定しています。":former&&ended?"卒業・所属終了が確認済みで、現在の所属がない場合は「所属終了」を選択してください。":"現在の所属が確認できない場合は「未確認」を選択してください。";
      }
      fields.get("activity")?.addEventListener("change",syncAgency);
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
        status.append(new Option("所属中", "current"), new Option("所属終了", "former"), new Option("未確認", "unknown"));
        status.value = value.status || (["ended","retired"].includes(fields.get("activity")?.value) ? "former" : "current");
        const from = el("input"), to = el("input");
        from.type = to.type = "date";
        from.value = value.from || "";
        to.value = value.to || "";
        for (const [label, field] of [["事務所", org], ["所属状態", status], ["所属開始日", from], ["所属終了日・卒業日", to]]) {
          // Native selects and dates have explicit accessible names, independent of option text.
          if (!field.cmsPicker) field.setAttribute("aria-label", label);
          row.append(pickerField(label, field));
        }
        const entry = { row, org, status, from, to };
        if (!existing) row.append(button("追加した所属を削除", () => {
          affiliationRows.splice(affiliationRows.indexOf(entry), 1);
          row.remove();syncAgency();
        }));
        affiliationRows.push(entry);
        rows.append(row);
        org.addEventListener("change",syncAgency);status.addEventListener("change",syncAgency);
        to.addEventListener("change",()=>{if(to.value&&status.value==="current"){status.value="former";syncAgency();}});
        syncAgency();
      }
      for (const value of input.affiliations || []) affiliation(value, Boolean(input.id));
      section.append(rows, button("所属を追加", () => { affiliation(); rows.lastElementChild?.querySelector("input[type=search]")?.focus(); }),agencyLabel,agencyHint);
      syncAgency();
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
    if (!unifiedGoods && !fullTalent && ((!input.id && !["campaign", "song", "video", "organization", "group", "offer", "performance"].includes(entity)) || entity === "talent")) {
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
      if (!unifiedGoods && ["anniversary", "product", "musicVideo", "karaoke"].includes(entity))
        multiRelation("talentIds", "関連する人物", catalog.people, input.talentIds);
      if (!unifiedGoods && ["anniversary", "product", "event"].includes(entity))
        multiRelation("groupIds", "関連グループ", (catalog.sections.find((row) => row.entity === "group")?.items || []).map(({ id, title }) => ({ id, name: title })), input.groupIds);
      if (entity === "event") {
        multiRelation("organizerIds", "主催事務所", catalog.organizations, input.organizerIds);
        multiRelation("relatedOrganizationIds", "関連事務所", catalog.organizations, input.relatedOrganizationIds);
      }
    }
    if (["group", "performance"].includes(entity))
      multiRelation("talentIds", entity === "group" ? "所属メンバー" : "歌唱者", catalog.people, input.talentIds);
    if (!unifiedGoods && entity === "product" && !input.id) {
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
    const productSales = entity === "product" && !unifiedGoods ? saleEditor(input.sales || [], input.id, true) : null;
    if (productSales) form.append(productSales.fieldset);
    const products = [];
    if (entity === "campaign" && !unifiedGoods) {
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

    // The common sales editor expands shared conditions into the original
    // independently identified offer records. Old records and URLs stay valid.
    function mountGoodsEditor() {
      const campaign = entity === "campaign", root = el("section");
      root.className="cms-goods-editor stack";
      const keys=["saleMode","startsAt","endsAt","url"];
      const conditions=(sale={})=>Object.fromEntries(keys.map(k=>[k,sale[k]||""]));
      const subjectOf=p=>({talentIds:p.talentIds||(p.talent?[p.talent]:[]),groupIds:p.groupIds||[]});
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      function commonest(rows,fallback){
        const counts=new Map();
        for(const r of rows){const k=JSON.stringify(r);counts.set(k,(counts.get(k)||0)+1);}
        const top=[...counts].sort((a,b)=>b[1]-a[1])[0];return top?JSON.parse(top[0]):fallback;
      }
      function field(host,label,type,value="",required=false){
        const c=el("input");c.type=type;c.value=value??"";c.required=required;c.setAttribute("aria-label",label);host.append(pickerField(label,c));return c;
      }
      function imageField(host,label,value){
        const c=field(host,label,"url",value),img=el("img");
        img.alt="画像プレビュー";img.referrerPolicy="no-referrer";img.className="cms-goods-preview";
        const update=()=>{img.hidden=!/^https:\/\//i.test(c.value);if(!img.hidden)img.src=c.value;};
        c.addEventListener("change",update);img.onerror=()=>{img.hidden=true;};update();host.append(img);return c;
      }
      function saleCondition(host,initial,requiredMode){
        // A known legacy mode cannot be silently reset to unknown.
        requiredMode=requiredMode||Boolean(initial.saleMode);
        const grid=el("div");grid.className="cms-goods-condition";
        const mode=el("select");
        mode.append(new Option(requiredMode?"販売方式を選択":"未確認（既存情報を維持）",""),new Option("先着販売","first_come"),new Option("受注販売","preorder"));
        mode.value=initial.saleMode||"";mode.required=requiredMode;mode.setAttribute("aria-label","販売方式");grid.append(pickerField("販売方式",mode));
        const start=field(grid,"販売開始日時（JST）","datetime-local",initial.startsAt);
        const end=field(grid,"販売終了日時（JST）","datetime-local",initial.endsAt);
        const url=field(grid,"公式販売URL","url",initial.url,true),hint=el("small");
        const update=()=>{
          start.required=requiredMode||!!mode.value;end.required=mode.value==="preorder";
          hint.textContent=mode.value==="preorder"?"開始・終了日時から受付期間を自動判定します。":mode.value==="first_come"?"開始日時から販売期間を判定します。終了は任意、在庫は手動確認。":"未確認の既存データはそのまま維持できます。";
          end.min=start.value||"";end.setCustomValidity(start.value&&end.value&&end.value<=start.value?"終了日時は開始日時より後にしてください。":"");
        };
        for(const c of [mode,start,end]){c.addEventListener("input",update);c.addEventListener("change",update);}
        update();grid.append(hint);host.append(grid);
        return {read:()=>({saleMode:mode.value,startsAt:start.value,endsAt:end.value,url:url.value.trim()}),
          set:v=>{mode.value=v.saleMode||"";start.value=v.startsAt||"";end.value=v.endsAt||"";url.value=v.url||"";update();},
          enabled:v=>{for(const c of [mode,start,end,url])c.disabled=!v||!catalog.editable;}};
      }
      function subjects(host,initial,label){
        const people=new Set(initial.talentIds),groups=new Set(initial.groupIds),all=catalog.contentPolicy==="all-content-v1";
        const notify=()=>host.dispatchEvent(new Event("change",{bubbles:true}));
        host.append(el("p",label+"VTuber"),relationPicker({choices:catalog.people,selected:people,label:label+"VTuber",multiple:all,onChange:notify}));
        if(all)host.append(el("p",label+"グループ"),relationPicker({choices:catalog.sections.find(r=>r.entity==="group")?.items||[],selected:groups,label:label+"グループ",multiple:true,onChange:notify}));
        return ()=>{const rank=new Map((catalog.people||[]).map((p,i)=>[p.id,i]));return {talent:[...people][0],talentIds:[...people].sort((a,b)=>(rank.get(a)??Infinity)-(rank.get(b)??Infinity)),groupIds:[...groups]};};
      }
      function toggle(host,text,checked,content,sync){
        const c=el("input");c.type="checkbox";c.checked=checked;
        const label=el("label",text);label.prepend(c);host.append(label,content);
        const update=()=>{content.hidden=!c.checked;sync(c.checked);};
        c.addEventListener("change",update);update();return c;
      }
      const initial=campaign?(input.products||[]):[{...input,sales:input.sales||[]}];
      const defaultCondition=commonest(initial.filter(p=>p.sales?.length).map(p=>conditions(p.sales[0])),conditions());
      const defaultSubject=commonest(initial.map(subjectOf),{talentIds:[],groupIds:[]});
      const defaultIdentity=commonest(initial.map(p=>p.identityUrl||"").filter(Boolean),"");
      const common=el("fieldset");common.className="cms-goods-common";
      common.append(el("legend",campaign?"共通の販売条件":"販売条件"));
      const commonSale=saleCondition(common,defaultCondition,!input.id);
      const readSubjects=subjects(common,defaultSubject,"関連");
      const official=campaign?field(common,"共通の公式商品情報URL（販売URLと同じなら省略）","url",defaultIdentity):null;
      if(campaign)common.append(el("small","共通項目は各商品に引き継がれます。異なる条件は商品内の例外設定から変更できます。"));
      root.append(common);
      if(campaign){
        const cover=el("fieldset");cover.append(el("legend","企画のメイン画像"));
        fields.set("campaignImage",imageField(cover,"メイン画像URL（任意）",input.campaignImage||""));root.append(cover);
      }
      const rows=el("div");rows.className="cms-goods-products stack";const items=[];
      function itemEditor(value={},single=false){
        const item=el(single?"section":"details");item.className="cms-goods-product";
        const summary=el(single?"h4":"summary",single?"商品・販売履歴":value.title||"新しい商品");
        item.append(summary);if(!single)item.open=!value.id;
        const content=el("div");content.className="cms-goods-product-body stack";
        const title=single?fields.get("title"):field(content,"商品名","text",value.title,true);
        if(!single)title.addEventListener("input",()=>summary.textContent=title.value||"新しい商品");
        const image=single?fields.get("image"):imageField(content,"商品画像URL（任意）",value.image||"");
        let customSubject=()=>readSubjects(),customIdentity=()=>official?.value.trim()||commonSale.read().url;
        if(!single){
          const sub=el("fieldset");sub.append(el("legend","個別の関連人物・グループ"));
          const read=subjects(sub,subjectOf(value),"商品");
          const check=toggle(content,"この商品だけ関連人物・グループを変更",Boolean((value.id||value.key)&&!same(subjectOf(value),defaultSubject)),sub,v=>{for(const c of sub.querySelectorAll("input,button"))c.disabled=!v||!catalog.editable;});
          customSubject=()=>check.checked?read():readSubjects();
          const identityBox=el("div"),identity=field(identityBox,"個別の公式商品情報URL","url",value.identityUrl||"",!value.id||!!value.identityUrl);
          const own=toggle(content,"この商品だけ公式商品情報URLを変更",Boolean((value.id||value.key)&&(value.identityUrl||"")!==defaultIdentity),identityBox,v=>identity.disabled=!v||!catalog.editable);
          customIdentity=()=>own.checked?identity.value.trim():official.value.trim()||commonSale.read().url;
        } else customIdentity=()=>fields.get("identityUrl").value.trim()||(value.id?"":commonSale.read().url);
        const sales=el("div");sales.className="stack";const saleRows=[];
        function addSale(sale={},idx=saleRows.length){
          const block=el("fieldset");block.className="cms-goods-sale";
          block.append(el("legend",idx?"追加販売・再販 "+idx:"販売情報"));
          const price=field(block,"価格（"+(sale.currency||"JPY")+"・任意）","number",sale.price||"");
          price.min="0";price.step=sale.currency&&sale.currency!=="JPY"?"any":"1";
          const custom=el("div"),individual=saleCondition(custom,conditions(sale),!sale.id);
          let seeded=Boolean(sale.url);
          let own=()=>idx>0;
          if(idx>0){block.append(custom);individual.enabled(true);}
          else if(!single){
            const c=toggle(block,"共通と異なる販売条件",Boolean((sale.id||sale.key||sale.url)&&!same(conditions(sale),defaultCondition)),custom,v=>{
              if(v&&!seeded){individual.set(commonSale.read());seeded=true;}
              individual.enabled(v);
            });
            own=()=>c.checked;
          } else individual.enabled(false);
          const manual=el("select");
          manual.append(new Option("自動判定","unknown"),new Option("売り切れ（確認済み）","sold_out"),new Option("販売終了（確認済み）","ended"));
          if(["on_sale","scheduled"].includes(sale.status))manual.append(new Option("既存の状態を維持（"+(sale.status==="on_sale"?"販売中":"販売予定")+"）",sale.status));
          manual.value=sale.status||"unknown";manual.setAttribute("aria-label","販売状態");block.append(pickerField("販売状態",manual));
          const note=el("textarea");note.value=sale.periodNote||"";note.maxLength=240;
          const extra=el("details");extra.append(el("summary","販売条件・補足（任意）"),pickerField("販売条件・補足",note));block.append(extra);
          const key=sale.key||(single?"cms-sale-":"")+crypto.randomUUID().replaceAll("-","").slice(0,12);
          const record={read:()=>({id:sale.id,key,...(own()?individual.read():commonSale.read()),price:price.value,currency:sale.currency||"JPY",status:manual.value,periodNote:note.value})};
          if(!sale.id&&idx)block.append(button("追加販売を取り除く",()=>{saleRows.splice(saleRows.indexOf(record),1);block.remove();}));
          saleRows.push(record);sales.append(block);
        }
        for(const s of value.sales||[])addSale(s);if(!saleRows.length)addSale();
        content.append(sales,button("再販・追加販売を登録",()=>addSale()));
        const key=value.key||value.id||crypto.randomUUID().replaceAll("-","").slice(0,12);
        const record={read:()=>({id:value.id,key,title:title.value,image:image.value,identityUrl:customIdentity(),...customSubject(),sales:saleRows.map(s=>s.read())})};
        if(!single&&!value.id)content.append(button("追加した商品を取り除く",()=>{items.splice(items.indexOf(record),1);item.remove();}));
        item.append(content);items.push(record);rows.append(item);
      }
      for(const p of initial)itemEditor(p,!campaign);
      if(campaign){if(!items.length)itemEditor();root.append(el("h4","商品一覧"),rows,button("商品を追加",()=>itemEditor()));}
      else root.append(rows);
      form.append(root);
      return {read:()=>{
        const products=items.map(i=>i.read());
        if(!products.length)throw new Error("goods_product_required");
        if(products.some(p=>!p.talentIds.length&&!p.groupIds.length))throw new Error("goods_subject_required");
        if(products.some(p=>p.sales.some(s=>!s.id&&!s.saleMode)))throw new Error("goods_mode_required");
        if(campaign)return {products};
        const {id,key,...data}=products[0];return data;
      }};
    }
    const goodsEditor=unifiedGoods?mountGoodsEditor():null;
    if (entity === "musicVideo") {
      const select = el("select");
      form.append(songPicker(select, input.songId));
      add("songId", "既存の楽曲", select);
      const {details, controls} = newSongFields(input);
      for (const [key, control] of Object.entries(controls)) fields.set(key, control);
      form.append(details);connectNewSong(select,details,controls);
    }
    if (entity === "event") multiRelation("performers", "出演者", catalog.people, input.performers);
    if(view!=="legacy"&&catalog.editable&&catalog.contentPolicy==="all-content-v1"&&["video","musicVideo","karaoke"].includes(entity)&&fields.has("videoUrl")) {
      const source=fields.get("videoUrl");const box=el("div");box.className="cms-video-lookup";
      const result=el("div");result.setAttribute("role","status");const find=button("YouTubeの情報を確認",async()=>{
        let id;try{id=youtubeId(source.value);}catch(error){result.textContent=error.message;return;}
        find.disabled=true;result.textContent="動画情報を取得中…";
        try{const data=await api("/api/cms/video-preview?"+new URLSearchParams({id}));if(!form.isConnected)return;let current;try{current=youtubeId(source.value)}catch{}if(current!==id){result.textContent="URLが変更されました。もう一度確認してください。";return;}
          result.replaceChildren(el("strong",data.title),el("small",data.publishedAt?new Date(data.publishedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"公開日時は未確認"),el("small","取得元："+(data.source==="catalog"?"登録済みデータ":data.source==="collected"?"収集済みデータ":"YouTube API")));
          const canonical="https://www.youtube.com/watch?v="+id;
          if(source.value!==canonical&&!source.readOnly){const use=button("正式な動画URLを使用",()=>{source.value=canonical;source.dispatchEvent(new Event("input",{bubbles:true}));use.remove()});use.dataset.pickerNavigation="";result.append(use);}
          if(entity==="musicVideo"&&fields.has("rawSongTitle")&&!fields.get("rawSongTitle").value){const use=button("動画タイトルを入力候補に使用",()=>{const target=fields.get("rawSongTitle");if(target.value&&!confirm("入力済みの曲名を動画タイトルで置き換えますか？"))return;target.value=data.title;target.dispatchEvent(new Event("input",{bubbles:true}));use.remove()});use.dataset.pickerNavigation="";result.append(use);}
        }catch(error){result.textContent="動画情報を取得できませんでした。公開動画のURL・収集状況を確認してください。";}finally{find.disabled=false;}
      });find.dataset.pickerNavigation="";box.append(find,result);source.addEventListener("input",()=>result.replaceChildren());source.closest(".cms-field")?.append(box);
    }

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
        connectNewSong(song,work.details,work.controls);
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
    if(view!=="legacy"&&catalog.editable&&catalog.contentPolicy==="all-content-v1"){
      const details=el("details");details.className="cms-official-source";details.append(el("summary","公式サイトから入力候補を取得"));
      const sourceKey=({talent:"officialProfileUrl",song:"songIdentityUrl",event:"announcementUrl",product:"identityUrl"})[entity];
      const source=el("input");source.type="text";source.inputMode="url";source.value=fields.get(sourceKey)?.value||"";source.placeholder="https://…";source.setAttribute("aria-label","情報取得元URL");
      const result=el("div");result.setAttribute("role","status");
      const htmlBox=el("details");htmlBox.append(el("summary","未対応サイトはHTMLを貼り付けて解析"));const html=el("textarea");html.rows=4;html.setAttribute("aria-label","公式サイトのHTML");html.placeholder="ページのソースを貼り付け（ブラウザー内で処理）";
      const map={title:({talent:"displayName",organization:"name",group:"name",musicVideo:"rawSongTitle",performance:"rawLabel"})[entity]||"title",description:"summary",image:entity==="event"?"thumbnailUrl":"image",url:sourceKey};
      function show(data){
        result.replaceChildren(el("small","情報源："+data.url),el("small","取得日時："+(data.retrievedAt||new Date().toISOString())));
        for(const [key,label] of [["title","ページタイトル"],["description","概要"],["image","画像URL"],["url","公式URL"]]){
          if(!data[key])continue;const row=el("div");row.className="cms-source-value";row.append(el("small",label),el("p",data[key]));
          const control=fields.get(map[key]);
          if(control&&!control.readOnly&&!control.disabled){const use=button("入力欄に反映",()=>{if(control.value&&control.value!==data[key]&&!confirm("入力済みの値を上書きしますか？"))return;control.value=data[key];control.dispatchEvent(new Event("input",{bubbles:true}));row.querySelector("small").textContent=label+"（反映済み）";});use.dataset.pickerNavigation="";row.append(use);}
          const copy=button("コピー",async()=>{try{await navigator.clipboard.writeText(data[key]);status.textContent="入力候補をコピーしました。";}catch{status.textContent="コピーできませんでした。";}});copy.dataset.pickerNavigation="";row.append(copy);result.append(row);
        }
      }
      const local=button("HTMLを解析",()=>{try{show(pageMetadata(html.value,source.value))}catch(error){result.textContent="解析できませんでした："+error.message}});local.dataset.pickerNavigation="";
      const fetchButton=button("公式情報を取得",async()=>{let url;try{url=officialUrl(source.value).href;}catch(error){result.textContent=error.message;return;}fetchButton.disabled=true;result.textContent="取得中…";try{const data=await api("/api/cms/official-preview?"+new URLSearchParams({url}));if(form.isConnected&&officialUrl(source.value).href===url)show(data);}catch(error){result.textContent="直接取得できませんでした。未対応ドメイン・リダイレクト・取得制限の場合はHTMLを貼り付けて解析してください。";}finally{fetchButton.disabled=false;}});fetchButton.dataset.pickerNavigation="";
      htmlBox.append(html,local);details.append(el("p","メタデータを入力候補として取得します。自動保存・自動公開はしません。直接取得は許可済み公式ドメインのみです。"),source,fetchButton,htmlBox,result);form.append(details);
    }
    if (view !== "legacy") {
      const guide = el("p", input.id ? "変更したい項目だけ編集できます。保存しても公開サイトには反映されません。" : "必須項目から入力してください。その他の情報は後から追加できます。");
      guide.className = "cms-editor-guide"; form.prepend(guide);
      for (const {details} of extraGroups.values()) form.append(details);
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
    let afterSave = "stay";
    let carry;
    const carryKeys = entity === "song" ? ["artists"] : entity === "event" ? ["venue","format","fee"] : [];
    if (catalog.editable && !input.id && view !== "legacy" && carryKeys.length) {
      carry=el("input"); carry.type="checkbox"; carry.checked=Boolean(input.carryNext);
      const label=el("label", entity==="song"?"次の登録にも原曲アーティストを引き継ぐ":"次の登録にも会場・開催形式・料金を引き継ぐ");
      label.className="cms-carry-next"; label.prepend(carry); footer.append(label);
    }
    const requestSave = mode => {
      if (saving || !saveAvailable || !catalog.editable || !form.reportValidity()) return;
      afterSave = mode; form.requestSubmit(submit);
    };
    if (catalog.editable && view !== "legacy") {
      submit.title = "下書きを保存（Ctrl / ⌘ + Enter）";
      submit.setAttribute("aria-keyshortcuts","Control+Enter Meta+Enter");
      const closeSave = button("保存して閉じる", () => requestSave("close"));
      closeSave.dataset.pickerNavigation = ""; footer.append(closeSave);
      if (!input.id) {
        const nextSave = button("保存して次を作成", () => requestSave("next"));
        nextSave.dataset.pickerNavigation = ""; footer.append(nextSave);
      }
      form.addEventListener("keydown", event => {
        if (event.isComposing || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
        event.preventDefault(); event.stopPropagation(); requestSave(event.shiftKey && !input.id ? "next" : "stay");
      });
    }
    if (catalog.editable && view !== "legacy") {
      const draftsLink = el("a", "下書きへ");
      draftsLink.href = "#drafts";
      footer.append(draftsLink);
    }
    const saveError = el("div"); saveError.className="cms-save-error"; saveError.setAttribute("role","alert"); saveError.hidden=true;
    form.append(saveError,footer);
    form.addEventListener("invalid", (event) => {
      const control = event.target;
      for(let parent=control.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==="DETAILS")parent.open=true;
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
      if (!catalog.editable || event?.target === carry || event?.target?.matches("input[type=search]") || event?.target?.closest(".cms-official-source")) return;
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
      const saveMode = afterSave; afterSave = "stay";
      let completed = false;
      saving = true;
      panel.dataset.cmsSaving = "true";
      saveStatus.textContent = "保存中…";
      saveError.hidden=true; saveError.replaceChildren();
      submit.disabled = true;
      try {
        const values = Object.fromEntries([...fields].map(([key, control]) => [key, control.value]));
        const peopleRank=new Map((catalog.people||[]).map((p,i)=>[p.id,i]));
        for (const [key, ids] of relations) values[key] = ['talentIds','performers'].includes(key)?[...ids].sort((a,b)=>(peopleRank.get(a)??Infinity)-(peopleRank.get(b)??Infinity)):[...ids];
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
        if (goodsEditor) Object.assign(values, goodsEditor.read());
        if (entity === "campaign" && !goodsEditor) values.products = products.map(({ value, key, controls, editor }) => ({
          id: value.id, key, sales: editor.read(),
          ...Object.fromEntries([...controls].map(([name, control]) => [name, control.value])),
        }));
        const payload = { entity, id: input.id, draftId, sha: formSha, revision, ...values };
        let result;
        try {
          result = await api("/api/cms/draft", "PUT", payload);
        } catch (error) {
          // Only a never-saved, standalone talent is eligible. Never rebase an
          // existing record, saved draft, or multi-record editor automatically.
          if ((error.code || error.message) !== "main_changed_reload" ||
              entity !== "talent" || input.id || draftId || !form.isConnected ||
              inputRevision !== submittedInputRevision) throw error;
          saveStatus.textContent = "最新データを確認中…";
          const latest = await api("/api/cms/catalog?fresh=1");
          if (!form.isConnected || inputRevision !== submittedInputRevision ||
              !latest.editable || latest.owner !== catalog.owner ||
              latest.contentPolicy !== catalog.contentPolicy ||
              !latest.categories?.includes("talents") ||
              !/^[0-9a-f]{40}$/.test(latest.sha || "") ||
              latest.sha === payload.sha) throw error;
          // Preserve the original workspace revision. The server revalidates
          // references, duplicate identities, permissions and revision as usual.
          formSha = latest.sha;
          result = await api("/api/cms/draft", "PUT", { ...payload, sha: formSha });
        }
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
          completed = true;
        } catch {
          saveAvailable = false;
          status.textContent = "下書きは保存されましたが一覧の再取得に失敗しました。再読み込みしてから編集を続けてください。";
          saveStatus.textContent = "保存済み・再読み込みが必要";
        }
      } catch (error) {
        panel.dataset.cmsDirty = "true";
        const code=String(error.code || error.message || "");
        const authExpired = ["login_required", "invalid_session", "github_401", "csrf_rejected"].includes(code);
        saveStatus.textContent = authExpired ? "再ログインが必要・入力保持" : "保存失敗・入力保持";
        status.textContent = authExpired
          ? "このタブを閉じず、上の再ログイン案内から認証を確認してから、もう一度下書きを保存してください。"
          : code === "main_changed_reload" && entity === "talent" && !input.id && !draftId
          ? "データの更新が続いています。入力は保持されています。少し時間をおいて、もう一度下書きを保存してください。"
          : ["main_changed_reload", "workspace_revision_conflict"].includes(code)
          ? "別の更新がありました。入力を控えてから画面を開き直してください。"
          : error.message === "cms_identity_anchor" ? "固定済みの収集アカウントはこの画面から変更できません。"
          : error.message === "affiliation_history_must_be_retained" ? "過去の所属を削除することはできません。"
          : error.message === "goods_subject_required" ? "関連VTuberまたはグループを1件以上選択してください。"
          : error.message === "goods_product_required" ? "商品を1件以上登録してください。"
          : error.message === "goods_mode_required" ? "新しい販売・再販は先着販売または受注販売を選択してください。共通条件が未確認の場合は個別の販売条件を設定できます。"
          : "保存できませんでした。入力内容と関連レコードの整合性を確認してください。";
        const accountService=code.startsWith("cms_invalid_account_url:")?code.split(":")[1]:null;
        const accountField={youtube:"youtubeUrl",x:"xUrl",twitch:"twitchUrl",tiktok:"tiktokUrl"}[accountService];
        const specific={
          cms_affiliation_state_mismatch:"現在の所属状況と所属履歴が一致していません。所属中の事務所、または所属終了の履歴を確認してください。",
          cms_affiliation_current_end:"終了日を入力した所属は「所属終了」に変更してください。",
          cms_affiliation_period:"所属の開始日と終了日の順序を確認してください。",
          identity_already_reserved:"同じ公式プロフィールまたはアカウントが登録済みです。既存のVTuberを検索してください。",
          cms_invalid_input:"入力形式または必須項目を確認してください。",
          cms_scope_denied:"この操作を行う権限がありません。",
          workspace_operation_limit:"下書き件数の上限に達しています。保存済みの下書きを確認してください。",
          no_changes:"保存する変更がありません。",
        };
        let detail=accountField?labels[accountField][0]+"が正しいプロフィールURLか確認してください。動画・投稿のURLは使用できません。":specific[code];
        if(code.startsWith("validation:")){
          const messages={"agency state contradicts current affiliations":specific.cms_affiliation_state_mismatch,"current affiliation requires affiliated agency state":specific.cms_affiliation_state_mismatch,"current affiliation cannot have an end date":specific.cms_affiliation_current_end,"reversed period":specific.cms_affiliation_period,"duplicate account identity":"同じSNSアカウントが別のVTuberに登録済みです。","unknown YouTube ID requires verified handle URL":"YouTubeは @ハンドル形式のチャンネルURLを入力してください。","internal ID identity anchor changed":"既存の固定IDの識別情報は変更できません。","account service/URL mismatch":"SNSの種類とURLが一致していません。","missing local profile image":"プロフィール画像が見つかりません。"};
          detail=Object.entries(messages).find(([key])=>code.includes(key))?.[1]||"入力内容がデータの検証条件を満たしていません。";
        }
        saveError.append(el("strong","保存できませんでした（入力は保持されています）"),el("p",detail||status.textContent));
        if(code && (/^[a-z][a-z0-9_]*(?::[a-z]+)?$/.test(code)||code.startsWith("validation:"))) {
          const technical=el("details");technical.append(el("summary","エラー詳細"),el("p",code.slice(0,650)));saveError.append(technical);
        }
        saveError.hidden=false;
        if(accountField && fields.has(accountField)){
          const control=fields.get(accountField);for(let p=control.parentElement;p&&p!==form;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;
          control.focus();control.scrollIntoView({block:"nearest"});
        }else saveError.scrollIntoView({block:"nearest"});
      } finally {
        saving = false;
        delete panel.dataset.cmsSaving;
        submit.disabled = !saveAvailable;
      }
      if (completed && inputRevision === submittedInputRevision && panel.isConnected) {
        if (saveMode === "close") closeEditor(true);
        if (saveMode === "next") {
          const seed = carry?.checked ? { ...Object.fromEntries(carryKeys.filter(key=>fields.has(key)).map(key=>[key,fields.get(key).value])), carryNext:true } : {};
          edit(entity, seed, undefined, forceUnified || unifiedGoods);
        }
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
    if (input.id) {
      const meta = el("small", input.id); meta.className = "cms-editor-id"; heading.append(meta);
      if (browsing) {
        const neighbors = [...list.querySelectorAll(".cms-record-link")];
        const index = neighbors.findIndex(node => node.dataset.recordId === input.id && node.dataset.entity === entity);
        for (const [label, delta] of [["前のレコード", -1], ["次のレコード", 1]]) {
          const target = index < 0 ? null : neighbors[index + delta];
          const nav = button(label, () => {
            const current = [...list.querySelectorAll(".cms-record-link")];
            const at = current.findIndex(node => node.dataset.recordId === input.id && node.dataset.entity === entity);
            if (at >= 0) current[at + delta]?.click();
          }); nav.disabled = !target; nav.title = label; heading.append(nav);
        }
      }
    }
    if (view !== "legacy" && browsing) {
      const expand = button("拡大", () => {
        const expanded = workspaceArea.classList.toggle("cms-editor-expanded");
        expand.textContent = expanded ? "一覧と並べる" : "拡大"; expand.setAttribute("aria-pressed", String(expanded));
      });
      expand.setAttribute("aria-pressed", String(workspaceArea.classList.contains("cms-editor-expanded"))); heading.append(expand);
    }
    if (view !== "legacy" && browsing) {
      const width = el("input"); width.type="range"; width.min="38"; width.max="65"; width.step="1";
      width.className="cms-editor-width"; width.setAttribute("aria-label","編集パネルの幅"); width.title="編集パネルの幅";
      let preferred=46;
      try { const value=Number(sessionStorage.getItem("jigwiki:editor-width")); if(value>=38&&value<=65)preferred=value; } catch {}
      width.value=String(preferred); workspaceArea.style.setProperty("--cms-editor-width",width.value+"%");
      width.oninput=()=>{workspaceArea.style.setProperty("--cms-editor-width",width.value+"%");try{sessionStorage.setItem("jigwiki:editor-width",width.value)}catch{}};
      heading.append(width);
    }
    if(catalog.editable && input.id && view !== "legacy" && ["song","event"].includes(entity)) {
      const reuse=button("入力を引き継いで新規作成",()=>{
        const keys=entity==="song"?["artists"]:["venue","format","fee"];
        const seed=Object.fromEntries(keys.filter(key=>fields.has(key)).map(key=>[key,fields.get(key).value]));
        edit(entity,seed,undefined,forceUnified||unifiedGoods);
      });
      reuse.title="共通項目だけ引き継ぎます。名称、URL、日時、固定IDは引き継ぎません。";heading.append(reuse);
      const duplicate=button("複製して新規作成",()=>{
        const keys=entity==="song"?["title","artists","aliases","readings"]:["title","summary","thumbnailUrl","venue","format","fee","streamUrl"];
        const seed=Object.fromEntries(keys.filter(key=>fields.has(key)).map(key=>[key,fields.get(key).value]));
        seed.title=(seed.title||"")+"（コピー）";seed.visibility="draft";
        if(entity==="event")seed.performers=[...(relations.get("performers")||[])];
        if(!confirm("入力内容を複製します。公式識別URL・開催日時・固定IDは引き継ぎません。新規データとして内容を確認してください。"))return;
        edit(entity,seed,undefined,forceUnified||unifiedGoods);
      });if(catalog.contentPolicy==="all-content-v1")heading.append(duplicate);
    }
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
    if (!browsing && view !== "legacy") formArea.scrollIntoView({block:"nearest"});
    ([...form.querySelectorAll("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)")].find(control => !control.closest("[hidden]") && control.getClientRects().length) || title).focus({ preventScroll: true });
  }
  if (saved) await refreshDrafts(true);
  if (["legacy", "history"].includes(view)) {
    const history = mountCmsHistory({ api, editable: catalog.editable, revision: () => revision, afterSave: refreshDrafts });
    history.open = view === "history";
    panel.append(history);
  }
  const headerTools = el("div"); headerTools.className="cms-header-tools";
  if(view!=="legacy"&&catalog.editable&&catalog.contentPolicy==="all-content-v1"){
    const dialog=el("dialog");dialog.className="cms-transfer-dialog";dialog.setAttribute("aria-label","一括登録・編集");
    const heading=el("h3","一括登録・編集");const dismiss=button("閉じる",()=>dialog.close());const top=el("div");top.className="cms-command-bar";top.append(heading,dismiss);
    const kind=el("select");kind.setAttribute("aria-label","対象データ");kind.append(...Object.entries(categories).filter(([entity,spec])=>catalog.categories.includes(spec.category)).map(([entity,spec])=>new Option(spec.label,entity)));
    const mode=el("select");mode.setAttribute("aria-label","一括操作");mode.append(new Option("既存データを編集","update"),new Option("新規登録","create"));
    const format=el("select");format.setAttribute("aria-label","入力形式");format.append(new Option("CSV","csv"),new Option("JSON","json"),new Option("表から貼り付け（TSV）","tsv"));
    const file=el("input");file.type="file";file.accept=".csv,.json,.tsv,text/csv,application/json,text/tab-separated-values";file.setAttribute("aria-label","ファイルを選択");
    const area=el("textarea");area.rows=8;area.setAttribute("aria-label","一括入力データ");
    const help=el("p");help.className="cms-transfer-help";
    const report=el("div");report.setAttribute("role","status");
    const actions=el("div");actions.className="cms-transfer-actions";
    let checked=null,busy=false;
    function invalidate(){checked=null;save.disabled=true;report.replaceChildren();}
    function updateHelp(){const keys=mode.value==="update"?["id",...editableKeys(kind.value)]:transferFields[kind.value].split(" ");help.textContent="使用できる列名："+keys.join(" / ")+"。1〜12件。空欄は空の値として扱います。変更しない列は含めないでください。配列項目はJSON配列で指定します。";area.placeholder=format.value==="json"?"[{ \""+keys[0]+"\": \"...\" }]":keys.slice(0,3).join(format.value==="tsv"?"\t":",");invalidate();}
    function payload(){return {entity:kind.value,mode:mode.value,rows:parseTransfer(area.value,format.value,kind.value,mode.value),revision,sha:catalog.sha};}
    const check=button("内容を検証",async()=>{if(busy||saving||!saveAvailable)return;invalidate();let input;try{input=payload();}catch(error){report.textContent=error.message;return;}busy=true;check.disabled=true;report.textContent="検証中…";
      try{const r=await api("/api/cms/transfer","POST",input);if(JSON.stringify(input)!==JSON.stringify(payload())){report.textContent="入力が変わりました。再検証してください。";return;}checked=input;report.replaceChildren(el("strong","検証済み： "+r.preview.filter(row=>!row.unchanged).length+"件"));for(const row of r.preview)report.append(el("div",row.row+"行目　"+(row.name||row.id||"新規データ")+(row.unchanged?"（変更なし）":"")));save.disabled=false;}
      catch(error){report.textContent="検証できませんでした："+error.message;}finally{busy=false;check.disabled=false;}});
    const save=button("まとめて下書きに保存",async()=>{if(!checked||busy||saving||!saveAvailable||panel.dataset.cmsDirty)return;let input;try{input=payload();}catch{return;}if(JSON.stringify(input)!==JSON.stringify(checked)){invalidate();return;}if(!confirm("検証済みの内容を下書きに保存します。公開は別途確認が必要です。"))return;
      busy=true;saving=true;panel.dataset.cmsSaving="true";save.disabled=true;check.disabled=true;
      try{const r=await api("/api/cms/transfer","PUT",input);revision=r.revision;checked=null;report.textContent=r.draftIds.length+"件の下書きを保存しました。";try{await refreshDrafts();}catch{saveAvailable=false;report.textContent+=" 一覧の再取得に失敗しました。再読み込みしてください。";}}
      catch(error){checked=null;report.textContent="一括保存できませんでした。下書きの状態を確認し、再検証してください："+error.message;}finally{busy=false;saving=false;delete panel.dataset.cmsSaving;check.disabled=false;refreshList();}});
    save.className="primary";save.disabled=true;
    for(const c of [kind,mode,format])c.onchange=updateHelp;area.oninput=invalidate;
    file.onchange=async()=>{const selected=file.files?.[0];if(!selected)return;if(selected.size>100000){report.textContent="100KB以下のファイルを選択してください。";return;}try{area.value=await selected.text();if(selected.name.endsWith(".json"))format.value="json";else if(selected.name.endsWith(".tsv"))format.value="tsv";else format.value="csv";updateHelp();}catch{report.textContent="ファイルを読み込めませんでした。";}};
    dialog.addEventListener("cancel",event=>{if(busy||saving)event.preventDefault();});dismiss.onclick=()=>{if(!busy&&!saving)dialog.close();};
    actions.append(check,save);dialog.append(top,pickerField("対象データ",kind),pickerField("操作",mode),pickerField("形式",format),file,help,area,report,actions);panel.append(dialog);
    const openTransfer=button("一括登録・編集",()=>{if(saving||panel.dataset.cmsDirty){status.textContent="編集中の変更を保存してから一括操作を開始してください。";return;}if(categories[selectedEntity])kind.value=selectedEntity;updateHelp();dialog.showModal();});
    headerTools.append(openTransfer);
  }
  if (view !== "legacy") {
    // One consistent searchable chooser, with scoped destinations and creation actions.
    const dialog=el("dialog"); dialog.className="cms-command-dialog cms-chooser";
    const heading=el("h3","操作を検索"); heading.id="cms-chooser-heading";
    dialog.setAttribute("aria-labelledby",heading.id);
    const close=button("×",()=>dialog.close());close.className="cms-chooser-close";close.setAttribute("aria-label","閉じる");
    const bar=el("div");bar.className="cms-command-bar";bar.append(heading,close);
    const searchRow=el("div");searchRow.className="cms-chooser-search";
    const searchIcon=el("span","⌕");searchIcon.setAttribute("aria-hidden","true");
    const query=el("input");query.type="search";query.autocomplete="off";query.setAttribute("aria-label","操作名を検索");
    searchRow.append(searchIcon,query);
    const results=el("div");results.className="cms-command-results";results.id="cms-chooser-results";
    const hint=el("div");hint.className="cms-chooser-footer";hint.append(el("small","↑ ↓ 選択　 Enter 実行　 Esc 閉じる"));
    const categoryLabels={talents:"人物・組織",organizations:"人物・組織",anniversaries:"人物・企画",events:"人物・企画",music:"音楽",goods:"グッズ"};
    const creationOrder=["talent","organization","group","anniversary","event","song","musicVideo","video","karaoke","performance","campaign","product"];
    const icons={talent:"user",organization:"building",group:"users",anniversary:"calendar",event:"calendar",song:"music",musicVideo:"video",video:"video",karaoke:"mic",performance:"list",campaign:"package",product:"package",goods:"package"};
    const iconPaths={user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m3 3a5 5 0 0 1 3 5v2"/>',building:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',music:'<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',video:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>',list:'<path d="M5 5h14M5 10h14M5 15h14M5 20h9"/>',package:'<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M7 5l10 4"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'};
    function glyph(entity){const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.6");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");svg.innerHTML=iconPaths[icons[entity]||"arrow"];return svg;}
    const available=creationOrder.filter(entity=>{const spec=categories[entity];return catalog.editable&&catalog.categories.includes(spec.category)&&(!spec.ownerCreate||catalog.owner||catalog.contentPolicy==="all-content-v1")});
    const nameOf=entity=>entity==="campaign"?"グッズ販売企画":entity==="product"?"単独商品":categories[entity]?.label||entity;
    const destinations=[["ダッシュボード","#dashboard",""],["下書き","#drafts",""],["公開状況","#publication",""],["全体検索","#search",""],["更新履歴","#history",""],...mergedSections.map(s=>[s.label,"#content/"+s.entity,s.entity])];
    const creates=available.map(entity=>({group:categoryLabels[categories[entity].category]||"その他",entity,label:nameOf(entity)+"を新規作成",short:nameOf(entity),hint:"新しいデータを下書きに登録",run:()=>edit(entity,{},undefined,true)}));
    const navigations=destinations.map(([name,route,entity])=>({group:"ページを開く",entity,label:name+"を開く",short:name,hint:"移動",run:()=>{if(location.hash!==route)location.hash=route}}));
    let mode="command", current=[],active=0,returnFocus;
    const normalize=value=>String(value||"").normalize("NFKC").toLocaleLowerCase("ja");
    function setActive(index){if(!current.length)return;active=Math.max(0,Math.min(current.length-1,index));const rows=[...results.querySelectorAll(".cms-chooser-option")];rows.forEach((row,i)=>row.toggleAttribute("data-active",i===active));rows[active]?.scrollIntoView({block:"nearest"});}
    function draw(){
      const needle=normalize(query.value.trim()),words=needle.split(/\s+/).filter(Boolean);
      let rows=mode==="create"?creates:[...creates.map(c=>({...c,group:"新規作成"})),...navigations];
      rows=rows.filter(c=>words.every(w=>normalize(c.label+" "+c.group+" "+c.hint).includes(w)));
      if(mode==="command"&&words.length){const found=[];for(const s of mergedSections){for(const item of s.items){if(words.every(w=>normalize([item.title,item.id,item.context].join(" ")).includes(w))){const route="#content/"+s.entity+"?"+new URLSearchParams({record:item.id});found.push({group:"登録済みデータ",entity:s.entity,label:item.title||item.id,short:item.title||item.id,hint:s.label,run:()=>{if(location.hash===route)openRecord(item.entity||s.entity,item.id);else location.hash=route;}});if(found.length>=20)break;}}if(found.length>=20)break;}rows.push(...found);}
      current=rows;active=0;results.replaceChildren();
      let group;for(const [i,c] of rows.entries()){
        if(group!==c.group){group=c.group;const label=el("div",group);label.className="cms-chooser-group";results.append(label);}
        const option=button("",()=>{dialog.close();c.run()});option.className="cms-chooser-option";option.setAttribute("aria-label",c.label);
        const icon=el("span");icon.className="cms-chooser-icon";icon.append(glyph(c.entity));const name=el("span",c.short);name.className="cms-chooser-name";const meta=el("small",mode==="create"?"":c.hint);meta.setAttribute("aria-hidden","true");option.append(icon,name,meta);option.addEventListener("pointermove",()=>setActive(i));results.append(option);
      }
      if(!rows.length)results.append(el("p","一致する項目がありません。別の言葉で検索してください。"));
      results.scrollTop=0;setActive(0);
    }
    function openChooser(nextMode="command"){if(saving||dialog.open||!panel.isConnected)return;mode=nextMode;returnFocus=document.activeElement;heading.textContent=mode==="create"?"何を作成しますか？":"操作を検索";query.placeholder=mode==="create"?"データの種類を検索…":"操作・ページ・データ名を検索…";query.value="";draw();dialog.showModal();query.focus();}
    query.addEventListener("input",draw);
    dialog.addEventListener("keydown",event=>{if(event.isComposing)return;if(event.key==="Escape"){event.preventDefault();event.stopPropagation();dialog.close();return;}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setActive(active+(event.key==="ArrowDown"?1:-1));}else if(event.key==="Enter"&&event.target===query){event.preventDefault();results.querySelectorAll(".cms-chooser-option")[active]?.click();}});
    dialog.addEventListener("close",()=>{if(document.activeElement===document.body&&returnFocus?.isConnected)returnFocus.focus();});
    dialog.append(bar,searchRow,results,hint);panel.append(dialog);
    const launch=button("操作を検索",()=>openChooser());launch.className="cms-command-launch";launch.title="操作を検索（/ または Alt / Option + K）";launch.setAttribute("aria-keyshortcuts","/ Alt+K");const key=el("kbd","/");key.setAttribute("aria-hidden","true");launch.append(key);headerTools.append(launch);
    if(creates.length){const create=button("＋ 新規作成",()=>openChooser("create"));create.className="cms-global-create";create.title="新規作成（C）";create.setAttribute("aria-keyshortcuts","C");headerTools.append(create);panel.addEventListener("cms-create-shortcut",()=>openChooser("create"));}
    panel.addEventListener("cms-command-shortcut",()=>openChooser());
  }
  if (!browsing && view !== "legacy" && headerTools.childElementCount) {
    const title=panel.querySelector("h2");
    if(title){const heading=el("div");heading.className="cms-page-heading";title.before(heading);heading.append(title,headerTools);}
    else panel.prepend(headerTools);
  }
  if (view === "dashboard") {
    const shortcuts = el("div");
    shortcuts.className = "cms-dashboard-collections";
    const intro = el("p", "新しいデータを作成するか、下書きの続きや既存データの編集を始めましょう。保存した変更は確認後に公開できます。");
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
    for (const { entity, label, items } of mergedSections) {
      const link = el("a");
      link.href = "#content/" + entity;
      link.append(el("strong", label), el("span", items.length + "件"));
      shortcuts.append(link);
    }
    panel.insertBefore(intro, draftsArea);
    if (summary.childElementCount) panel.insertBefore(summary, draftsArea);
    const quality = el("section"); quality.className="cms-quality-summary";
    const reviewLinks = mergedSections.map(s=>({entity:s.entity,label:s.label,count:s.items.filter(item=>needsReview(s.entity,item)).length})).filter(s=>s.count);
    if (reviewLinks.length) {
      quality.append(el("h3","確認候補"),el("p","未確認の状態や開催日時がないデータを表示します。情報の非公表・不明は誤りとは限りません。"));
      for(const s of reviewLinks){const link=el("a",s.label+" · "+s.count+"件");link.href="#content/"+s.entity+"?quality=review";quality.append(link);}
      panel.insertBefore(quality,draftsArea);
    }
    const startHeading = el("h3", "編集するデータを選ぶ");
    panel.insertBefore(startHeading, draftsArea); panel.insertBefore(shortcuts, draftsArea);
    if (tracksPublication) panel.append(publicationArea);
    // An empty review list is not an action; the dedicated drafts screen keeps all controls.
    if (saved && !saved.drafts.length) draftsArea.hidden = true;
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
      heading.append(title, actions); actions.append(headerTools);
    } else list.append(actions);
  } else list.append(actions);
  if (goodsView && catalog.editable && catalog.categories.includes("goods")) {
    for(const [entity,label] of [["campaign","販売企画を新規登録"],["product","単独商品を新規登録"]]){
      const create=button(label,()=>edit(entity));create.className=entity==="campaign"?"primary cms-create":"cms-create";actions.append(create);
    }
  }
  for (const [entity, spec] of Object.entries(categories)) {
    if (!goodsView && ["legacy", "content"].includes(view) && (!selectedEntity || selectedEntity === entity) && (!spec.ownerCreate || catalog.owner || catalog.contentPolicy === "all-content-v1") && catalog.editable && catalog.categories.includes(spec.category))
      {
        const create = button(spec.label + "を新規登録", () => edit(entity));
        create.className = "primary cms-create";
        actions.append(create);
      }
  }
  const stateLabels = {
    public: "公開", private: "非公開", draft: "非公開・下書き",
    active: "活動中", hiatus: "活動休止", retired: "引退", ended: "終了",
    on_sale: "販売期間中", scheduled: "販売予定", actual: "実施日時", sold_out: "売り切れ", unknown: "未確認",
    partial_sale:"一部販売期間中",partial_scheduled:"一部販売予定",closed:"販売終了・売り切れ",
    verified: "確認済み", unreviewed: "未確認", rejected: "対象外",
    complete: "確認完了", partial: "一部確認", unavailable: "利用不可",
    unlisted: "限定公開", cancelled: "中止", postponed: "延期",
  };
  const translated = (value) => value ? (selectedEntity === "event" ? ({scheduled:"開催予定",actual:"実施日時",unknown:"未確認"})[value] : undefined) || stateLabels[value] || "未確認" : "—";
  const normal = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja");
  const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const formatDate = (value) => !value ? "" : /T\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : value;
  const columns = [
    ["title", goodsView?"販売企画・商品名":"名称"], ["context", ({talent:"所属・グループ",group:"所属事務所",song:"原曲アーティスト",event:"主催・会場",anniversary:"関連人物",musicVideo:"歌唱者",karaoke:"関連人物",performance:"歌唱者",goods:"商品・関連人物"})[selectedEntity] || "関連情報"], ["date", goodsView?"販売開始":selectedEntity==="event"?"開催日時":selectedEntity==="video"?"動画公開日時":"日時"],
    ...(goodsView?[["saleMode","販売方式"]]:[]),
    ["state", ({talent:"活動状態",event:"日程区分",video:"動画の公開状態",performance:"確認状態",goods:"販売状態"})[selectedEntity] || "状態"], ["visibility", "掲載状態"], ["draft", "下書き"], ["quality","確認候補"], ["id", "固定ID"],
  ];
  const hasValue = (key) => sections.some(({ items }) => items.some((item) => Boolean(item[key])));
  const compactViewport = matchMedia("(max-width: 767px)").matches;
  const activeColumns = new Set(compactViewport ? ["title", "visibility", ...["state"].filter(hasValue)] :
    ["title", "visibility", "draft", ...["context", "date", "state", ...(goodsView?["saleMode"]:[])].filter(hasValue)]);
  const bulkAvailable = view === "content" && !goodsView && selectedEntity !== "organization" &&
    catalog.editable && catalog.contentPolicy === "all-content-v1";
  const selectedRows = new Set();
  const viewKey = "jigwiki:cms-view:v1:" + (options.userKey || "local") + ":" + (selectedEntity || view);
  let viewState = {};
  try { viewState = JSON.parse(sessionStorage.getItem(viewKey) || "{}") || {}; } catch {}
  if (options.quality==="review") activeColumns.add("quality");
  if (Array.isArray(viewState.columns)) {
    activeColumns.clear(); activeColumns.add("title");
    for (const [key] of columns) if (viewState.columns.includes(key)) activeColumns.add(key);
  }
  if(options.quality==="review")activeColumns.add("quality");
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
  if(bulkAvailable){
    const multi=button("複数項目を編集",()=>{
      if(saving||!saveAvailable||!selectedRows.size||panel.dataset.cmsDirty){status.textContent="編集中の変更を保存してから一括編集してください。";return;}
      const ids=[...selectedRows];const dialog=el("dialog");dialog.className="cms-transfer-dialog";dialog.setAttribute("aria-label","複数項目を一括編集");
      const bar=el("div");bar.className="cms-command-bar";const close=button("閉じる",()=>{if(!saving)dialog.close()});bar.append(el("h3",ids.length+"件を一括編集"),close);
      const fieldsBox=el("div");fieldsBox.className="cms-multi-edit-fields";const chosen=new Map();
      const labelsByKey={...Object.fromEntries(Object.entries(labels).map(([k,v])=>[k,v[0]])),visibility:"掲載状態",image:"プロフィール画像URL"};
      const commonChoices={...bulkValues,format:["unknown","onsite","online","hybrid"],status:["unknown","scheduled","on_sale","ended","sold_out"]};
      for(const field of editableKeys(selectedEntity)){
        const row=el("div");row.className="cms-multi-edit-row";const toggle=el("input");toggle.type="checkbox";const label=el("label",labelsByKey[field]||field);label.prepend(toggle);const choices=commonChoices[field];
        const control=el(choices?"select":labels[field]?.[1]==="textarea"?"textarea":"input");if(choices)control.append(...choices.map(v=>new Option(translated(v),v)));else if(control.tagName==="INPUT")control.type=labels[field]?.[1]==="url"?"url":"text";
        control.disabled=true;control.setAttribute("aria-label",(labelsByKey[field]||field)+"の変更後の値");toggle.onchange=()=>{control.disabled=!toggle.checked;};chosen.set(field,{toggle,control});row.append(label,control);fieldsBox.append(row);
      }
      const result=el("p");result.setAttribute("role","status");let checked=null,busy=false;
      function payload(){const changes=Object.fromEntries([...chosen].filter(([,v])=>v.toggle.checked).map(([k,v])=>[k,v.control.value]));if(!Object.keys(changes).length)throw Error("変更する項目を選択してください。");return {entity:selectedEntity,mode:"update",rows:ids.map(id=>({id,...changes})),revision,sha:catalog.sha};}
      const check=button("変更内容を検証",async()=>{if(busy||saving)return;checked=null;apply.disabled=true;let input;try{input=payload()}catch(error){result.textContent=error.message;return;}busy=true;check.disabled=true;result.textContent="検証中…";try{const r=await api("/api/cms/transfer","POST",input);if(JSON.stringify(input)!==JSON.stringify(payload()))throw Error("入力が変わりました。");checked=input;result.textContent=r.preview.filter(v=>!v.unchanged).length+"件を変更できます。";apply.disabled=false;}catch(error){result.textContent="検証できませんでした："+error.message;}finally{busy=false;check.disabled=false;}});
      const apply=button("まとめて下書きに保存",async()=>{if(!checked||busy||saving||panel.dataset.cmsDirty)return;let input;try{input=payload()}catch{return;}if(JSON.stringify(checked)!==JSON.stringify(input)){apply.disabled=true;result.textContent="再検証してください。";return;}if(!confirm("検証した変更をまとめて保存します。公開は別途確認が必要です。"))return;busy=true;saving=true;panel.dataset.cmsSaving="true";apply.disabled=true;check.disabled=true;try{const r=await api("/api/cms/transfer","PUT",input);revision=r.revision;selectedRows.clear();checked=null;result.textContent=r.draftIds.length+"件の下書きを保存しました。";try{await refreshDrafts()}catch{saveAvailable=false;result.textContent+=" 再読み込みが必要です。";}}catch(error){result.textContent="保存できませんでした："+error.message;checked=null;}finally{busy=false;saving=false;delete panel.dataset.cmsSaving;check.disabled=false;filter();}});apply.className="primary";apply.disabled=true;
      fieldsBox.addEventListener("input",()=>{checked=null;apply.disabled=true;result.textContent="変更内容を検証してください。";});
      dialog.addEventListener("cancel",event=>{if(busy||saving)event.preventDefault()});dialog.addEventListener("close",()=>dialog.remove());
      const actions=el("div");actions.className="cms-transfer-actions";actions.append(check,apply);dialog.append(bar,el("p","変更する項目だけにチェックを入れてください。チェックしていない項目は変更されません。"),fieldsBox,result,actions);panel.append(dialog);dialog.showModal();
    });multi.className="cms-multi-edit-launch";bulkBar.append(multi);
  }
  // Paste values into one supported field using the existing lossless bulk API.
  let pasteMenu;
  if(bulkAvailable&&catalog.publishable&&!catalog.owner){
    const paste=el("details");paste.className="cms-bulk-paste";paste.append(el("summary","表から貼り付け"));
    const area=el("textarea");area.setAttribute("aria-label","貼り付けデータ");area.placeholder="固定ID\\t値（1行に1件、最大12件）";area.rows=4;
    const pasteField=el("select");pasteField.setAttribute("aria-label","貼り付ける項目");pasteField.append(...[...bulkField.options].map(o=>new Option(o.text,o.value)));
    const info=el("small","変更項目を選択し、固定IDと値の2列を貼り付けてください。");const preview=el("div");let plan=[];
    function validate(){plan=[];preview.replaceChildren();const field=pasteField.value,allowed=bulkValues[field];const rows=area.value.trim().split(/\\r?\\n/).filter(Boolean);const ids=new Set();const items=sections.flatMap(s=>s.items);const used=new Set((saved?.drafts||[]).filter(d=>d.input?.entity===selectedEntity).map(d=>d.input.id));if(!rows.length||rows.length>12){preview.textContent="1〜12行を入力してください。";return false;}for(const line of rows){const parts=line.split("\\t").map(s=>s.trim());const [id,label]=parts;const value=allowed.find(v=>v===label||translated(v)===label);if(parts.length!==2||!items.some(i=>i.id===id)||used.has(id)||ids.has(id)||!value){preview.textContent="無効な行、重複ID、既存下書き、または未対応の値があります："+line;plan=[];return false;}ids.add(id);plan.push({id,value});}for(const row of plan)preview.append(el("div",row.id+" → "+translated(row.value)));return true;}
    const check=button("内容を確認",validate);const apply=button("貼り付けを下書きに保存",async()=>{if(saving||!saveAvailable||panel.dataset.cmsDirty||!validate())return;const field=pasteField.value;if(!confirm(plan.length+"件の変更をまとめて下書きに保存します。"))return;saving=true;panel.dataset.cmsSaving="true";try{const result=await api("/api/cms/transfer","PUT",{entity:selectedEntity,mode:"update",rows:plan.map(row=>({id:row.id,[field]:row.value})),revision,sha:catalog.sha});revision=result.revision;area.value="";preview.textContent="保存済み";status.textContent=result.draftIds.length+"件の下書きを保存しました。";try{await refreshDrafts()}catch{saveAvailable=false;status.textContent+=" 一覧の再取得に失敗しました。";}}catch{status.textContent="一括保存できませんでした。下書きと入力を確認してください。";}finally{saving=false;delete panel.dataset.cmsSaving;filter();}});
    paste.append(pasteField,info,area,check,preview,apply);pasteMenu=paste;
  }
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
  search.placeholder = goodsView ? "販売企画・商品名・VTuber名を検索" : "名称・ID・関連情報を検索";
  search.setAttribute("aria-label", "名称を検索");
  category.setAttribute("aria-label", "コンテンツの種類");
  order.setAttribute("aria-label", "並び順");
  visibility.setAttribute("aria-label", "公開状態で絞り込む");
  state.setAttribute("aria-label", "状態で絞り込む");
  draftFilter.setAttribute("aria-label", "下書きで絞り込む");
  category.append(new Option("すべての種類", ""), ...sections.map(({ entity, label }) => new Option(label, entity)));
  order.append(new Option(selectedEntity==="talent"?"事務所別・所属／デビュー日順":"標準順", ""), new Option("名前順", "name"), new Option("名前順（降順）", "name-desc"), new Option("固定ID順", "id"));
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
  const modeFilter=el("select");modeFilter.setAttribute("aria-label","販売方式で絞り込む");
  modeFilter.append(new Option("販売方式：すべて",""),...[...new Set(goodsSection.items.map(item=>item.saleMode).filter(Boolean))].map(mode=>new Option(mode,mode)));
  const qualityFilter=el("select");qualityFilter.setAttribute("aria-label","確認候補で絞り込む");qualityFilter.append(new Option("確認候補：すべて",""),new Option("確認候補のみ","review"));
  qualityFilter.hidden=!["event","talent","performance","goods","karaoke","song"].includes(selectedEntity);
  modeFilter.hidden=!goodsView;tools.append(category, search, visibility, state, modeFilter, draftFilter, qualityFilter, order, columnMenu);
  list.append(tools);
  if(pasteMenu)list.append(pasteMenu);
  const views = [];
  const collator = new Intl.Collator("ja");
  const continuous = view !== "legacy";
  let page = Number.isSafeInteger(viewState.page) && viewState.page >= 0 ? viewState.page : 0;
  const pageSize = 50;
  let renderedPage=-1, hasMore=false, observer;
  const filters = { search, category, visibility, state, modeFilter, draftFilter, qualityFilter, order };
  for (const [key, control] of Object.entries(filters)) {
    if (typeof viewState[key] !== "string") continue;
    if (control === search || [...control.options].some(option => option.value === viewState[key])) control.value = viewState[key];
  }
  if(options.quality==="review"&&!qualityFilter.hidden){qualityFilter.value="review";page=0;search.value="";visibility.value="";state.value="";draftFilter.value="";modeFilter.value="";}
  const resetFilters=button("絞り込みを解除",()=>{for(const control of Object.values(filters))control.value="";page=0;filter()});resetFilters.className="cms-reset-filters";tools.append(resetFilters);
  const presetsKey=viewKey+":presets";let presets=[];
  try{const value=JSON.parse(localStorage.getItem(presetsKey)||"[]");if(Array.isArray(value))presets=value.filter(x=>typeof x.name==="string"&&x.filters&&Array.isArray(x.columns)).slice(0,20);}catch{}
  if(view==="content"){
    const presetMenu=el("details");presetMenu.className="cms-presets";presetMenu.append(el("summary","保存ビュー"));
    const body=el("div");body.className="cms-presets-body";const savedSelect=el("select");savedSelect.setAttribute("aria-label","保存ビューを選択");
    const drawPresets=()=>{savedSelect.replaceChildren(new Option("保存ビューを選択",""),...presets.map((p,i)=>new Option(p.name,String(i))));};drawPresets();
    const name=el("input");name.placeholder="ビュー名";name.maxLength=50;name.setAttribute("aria-label","ビュー名");
    const store=next=>{try{localStorage.setItem(presetsKey,JSON.stringify(next));presets=next;drawPresets();return true;}catch{status.textContent="ビューを保存できませんでした。";return false;}};
    const apply=()=>{const p=presets[Number(savedSelect.value)];if(savedSelect.value===""||!p)return;for(const [key,control] of Object.entries(filters)){const value=p.filters[key];control.value=typeof value==="string"&&(control===search||[...control.options].some(o=>o.value===value))?value:"";}activeColumns.clear();activeColumns.add("title");for(const [key] of columns)if(p.columns.includes(key))activeColumns.add(key);[...columnMenu.querySelectorAll("input")].forEach((c,i)=>c.checked=activeColumns.has(columns[i+1][0]));page=0;filter();presetMenu.open=false;};
    savedSelect.onchange=apply;
    const storeButton=button("現在の表示を保存",()=>{const label=name.value.trim();if(!label)return name.focus();if(presets.length>=20&&!presets.some(p=>p.name===label)){status.textContent="保存ビューは20件までです。";return;}if(presets.some(p=>p.name===label)&&!confirm("同じ名前のビューを上書きしますか？"))return;const p={name:label,filters:Object.fromEntries(Object.entries(filters).map(([k,c])=>[k,c.value])),columns:[...activeColumns]};if(store([...presets.filter(p=>p.name!==label),p])){name.value="";status.textContent="ビューを保存しました。";}});
    const remove=button("名前を指定して削除",()=>{const label=name.value.trim();if(label&&presets.some(p=>p.name===label)&&confirm("保存ビュー「"+label+"」を削除しますか？")){store(presets.filter(p=>p.name!==label));name.value="";}});
    body.append(savedSelect,name,storeButton,remove,el("small","このブラウザーにのみ保存されます。"));presetMenu.append(body);tools.append(presetMenu);
  }
  function persistView() {
    try { sessionStorage.setItem(viewKey, JSON.stringify({ ...Object.fromEntries(Object.entries(filters).map(([key, control]) => [key, control.value])), columns: [...activeColumns], page, scroll: list.scrollTop })); } catch {}
  }
  list.addEventListener("scroll", persistView, {passive:true});
  const paging = el("div");
  paging.className = "cms-toolbar cms-paging";
  const count = el("p");
  count.setAttribute("aria-live", "polite");
  const previous = button("前のページ", () => { page--; filter(); });
  const next = button(continuous?"さらに表示":"次のページ", () => { if(continuous)loadMore();else{page++;filter();} });
  if(continuous){
    count.className="cms-list-count";tools.append(count);
    paging.append(next);
    observer=new IntersectionObserver(entries=>{
      if(!list.isConnected){observer.disconnect();return;}
      if(entries.some(entry=>entry.isIntersecting))loadMore();
    },{root:null,rootMargin:"0px 0px 160px 0px"});
  }else paging.append(count,previous,next);
  function loadMore(){
    if(!continuous||!hasMore||!list.isConnected||!list.getClientRects().length)return;
    page++;filter(true);
  }
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
    entity = item.entity || entity;
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
        title.dataset.recordId = item.id; title.dataset.entity = entity; title.title = item.title || item.id;
        const name = el("span", item.title || item.id); name.className = "cms-record-name"; title.replaceChildren(name);
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
        title.addEventListener("keydown",event=>{
          if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
          if(!["ArrowUp","ArrowDown"].includes(event.key))return;
          const rows=[...list.querySelectorAll(".cms-record-link")];const at=rows.indexOf(title);const target=rows[at+(event.key==="ArrowDown"?1:-1)];if(target){event.preventDefault();target.focus();}
        });
        const entry=el("div");entry.className="cms-row-title";entry.append(title);
        if(view!=="legacy") {
          const link=button("↗",async()=>{
            const routeEntity=["campaign","product"].includes(entity)&&catalog.goodsEntries?.some(row=>row.entity===entity&&row.id===item.id)?"goods":entity;
            const url=new URL("#content/"+routeEntity+"?"+new URLSearchParams({record:item.id}),location.href).href;
            try { await navigator.clipboard.writeText(url); status.textContent="編集リンクをコピーしました。"; }
            catch { status.textContent="編集リンクをコピーできませんでした。"; }
          });
          link.className="cms-row-link-copy";link.title="編集リンクをコピー";link.setAttribute("aria-label",(item.title||item.id)+"の編集リンクをコピー");entry.append(link);
        }
        cell.append(entry);
      } else if (key === "visibility" || key === "state") {
        const field = key === "visibility" ? "visibility" : entity === "talent" ? "activity" : entity === "performance" ? "verification" : null;
        const canInline = bulkAvailable && catalog.publishable && !catalog.owner && field && !draft && bulkValues[field]?.includes(item[key]);
        if (canInline) {
          const select = el("select"); select.className = "cms-inline-select";
          select.setAttribute("aria-label", (item.title || item.id) + "の" + (key === "visibility" ? "掲載状態" : entity === "talent" ? "活動状態" : "確認状態"));
          select.append(...bulkValues[field].map(value => new Option(translated(value),value))); select.value = item[key];
          select.disabled = saving || !saveAvailable;
          select.onchange = async () => {
            const value = select.value; select.value = item[key];
            if (saving || !saveAvailable || panel.dataset.cmsDirty) { status.textContent = "編集中の変更を保存してから一覧を編集してください。"; return; }
            saving = true; panel.dataset.cmsSaving = "true"; select.disabled = true;
            try {
              const result = await api("/api/cms/draft/bulk", "PUT", { entity, ids:[item.id], field, value, revision, sha:catalog.sha });
              revision = result.revision;
              try { await refreshDrafts(); status.textContent = "下書きを保存しました。公開サイトには反映されていません。"; }
              catch { saveAvailable = false; status.textContent = "下書きは保存されましたが再取得に失敗しました。再読み込みしてください。"; }
            } catch { status.textContent = "変更を保存できませんでした。既存の下書きや最新のデータを確認してください。"; }
            finally { saving = false; delete panel.dataset.cmsSaving; filter(); }
          };
          cell.append(select);
        } else {
          const draftValue = draft && !draft.conflict && !draft.reapplyJobId && field ? draft.input?.[field] : undefined;
          const tag = el("span", translated(draftValue || item[key]));
          tag.className = "cms-record-state"; tag.dataset.state = draftValue || item[key] || "";
          if (draftValue && draftValue !== item[key]) { tag.title = "公開中：" + translated(item[key]); tag.classList.add("cms-pending-state"); }
          cell.append(tag);
        }
      } else if(key==="quality"){
        const reasons=qualityReasons(goodsView?"goods":entity,item);cell.textContent=reasons.join("・")||"—";cell.title=cell.textContent;
      } else if (key === "draft") {
        cell.textContent = draft ? draft.conflict ? "要確認" : "下書きあり" : "—";
      } else {
        cell.textContent = key === "date" ? formatDate(item.date) || "—" : item[key] || "—";
        if (key === "context" || key === "date") cell.title = cell.textContent;
      }
      row.append(cell);
    }
    return row;
  };
  function filter(appendOnly = false) {
    // Event handlers may pass an Event; only an explicit true requests an append.
    const append = continuous && appendOnly === true && renderedPage === page - 1;
    const needle = normal(search.value.trim());
    const drafts = new Map((saved?.drafts || []).filter(({ input }) => input?.id).map((draft) => [draft.input.entity + ":" + draft.input.id, draft]));
    let total = 0, longest = 0, offset = 0, displayed=0;
    for (const { entity, section, headerRow, entries, items } of views) {
      const visible = !category.value || category.value === entity;
      section.hidden = !visible;
      if (!visible) { entries.replaceChildren(); continue; }
      const matching = items.filter((item) => {
        const draft = drafts.get((item.entity || entity) + ":" + item.id);
        return normal([item.title, item.id, item.context, item.description, formatDate(item.date)].join(" ")).includes(needle) &&
          (!visibility.value || item.visibility === visibility.value) &&
          (!state.value || item.state === state.value) &&
          (!modeFilter.value || item.saleMode === modeFilter.value) &&
          (!qualityFilter.value || needsReview(goodsView?"goods":entity,item)) &&
          (!draftFilter.value || Boolean(draft) === (draftFilter.value === "yes"));
      });
      if (order.value === "name" || order.value === "name-desc") matching.sort((a, b) => collator.compare(a.title || a.id, b.title || b.id) * (order.value === "name-desc" ? -1 : 1));
      if (order.value === "id") matching.sort((a, b) => collator.compare(a.id, b.id));
      total += matching.length;
      longest = Math.max(longest, matching.length);
      // Search pages have one global 50-row budget; legacy grouped view retains its separate collections.
      const sectionOffset=view==="search"?offset:0;
      const lower=(continuous ? (append?page*pageSize:0) : page*pageSize)-sectionOffset;
      const upper=(page+1)*pageSize-sectionOffset;
      offset += matching.length;
      const windowRows = matching.slice(Math.max(0, lower), Math.max(0, upper));
      displayed+=continuous?Math.min(matching.length,Math.max(0,upper)):windowRows.length;
      const shown = columns.filter(([key]) => activeColumns.has(key));
      if(!append)headerRow.replaceChildren(...shown.map(([key, label]) => { const th = el("th", label); th.scope = "col"; th.dataset.column = key; return th; }));
      if (bulkAvailable && !append) {
        const th = el("th", "選択");
        th.scope = "col";
        headerRow.prepend(th);
      }
      const nodes=windowRows.map(item=>makeRow(entity,item,drafts.get((item.entity||entity)+":"+item.id)));
      if(append)entries.append(...nodes);else entries.replaceChildren(...nodes);
      if (view === "search" && !entries.childElementCount) section.hidden = true;
      else if (!append && !windowRows.length) {
        const empty = el("tr");
        const cell = el("td", "該当するコンテンツはありません。");
        cell.colSpan = shown.length + Number(bulkAvailable);
        empty.append(cell);
        entries.append(empty);
      }
    }
    const max = view === "search" ? total : longest;
    const lastPage = Math.max(0, Math.ceil(max / pageSize) - 1);
    if (page > lastPage) { page = lastPage; filter(); return; }
    renderedPage=page;
    previous.disabled = page === 0;
    hasMore=(page+1)*pageSize<max;
    next.disabled=!hasMore;
    if(continuous){
      count.textContent=displayed+" / "+total+"件を表示";
      paging.hidden=!hasMore;
      observer.unobserve(paging);
      if(hasMore&&paging.isConnected)observer.observe(paging);
    }else count.textContent=total+"件 / "+(page+1)+" / "+(lastPage+1)+"ページ";
    if (bulkAvailable) updateBulk();
    resetFilters.hidden=!Object.entries(filters).some(([key,control])=>key!=="order"&&Boolean(control.value));
    persistView();
  }
  const reset = () => { page = 0; list.scrollTop=0; filter(); };
  search.addEventListener("input", reset);
  for (const control of [category, visibility, state, modeFilter, draftFilter, qualityFilter, order]) control.addEventListener("change", reset);
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
  const initialScroll = Number(viewState.scroll) || 0;
  filter();
  list.scrollTop = initialScroll;
  if (goodsView && globalThis.Goods?.productAggregate) {
    const refreshSales=()=>{
      if(!panel.isConnected){clearInterval(timer);return;}
      let changed=false;
      for(const item of goodsSection.items){
        const next=globalThis.Goods.productAggregate(item.sales||[]).code;
        if(next!==item.state){item.state=next;changed=true;}
      }
      if(changed){
        const selected=state.value;
        state.replaceChildren(new Option("状態：すべて",""),...[...new Set(goodsSection.items.map(item=>item.state).filter(Boolean))].map(value=>new Option(translated(value),value)));
        if([...state.options].some(option=>option.value===selected))state.value=selected;
        filter();
      }
    };
    const timer=setInterval(refreshSales,60000);
  }
  if (view === "search") search.focus();
  if (saveAvailable) status.textContent = "";
  if (options.recordId && selectedEntity) {
    const match=sections.flatMap(s=>s.items.map(item=>({entity:s.entity,...item}))).find(item=>item.id===options.recordId);
    if(match)await openRecord(match.entity,options.recordId);
    else status.textContent = "対象レコードが存在しないか、閲覧権限がありません。";
  }
}
