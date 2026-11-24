import { mountCmsHistory } from "./cms-history.js";
import { renderDraftConflicts } from "./cms-conflicts.js";

const labels = {
  artists: ["原曲アーティスト（1行に1名）", "textarea"],
  aliases: ["曲の別名（1行に1件）", "textarea"], readings: ["曲名の読み（1行に1件）", "textarea"],
  songIdentityUrl: ["楽曲の公式情報URL", "url"],
  rawSongTitle: ["動画に記載された曲名", "text"], videoUrl: ["YouTube動画URL", "url"], videoKind: ["動画の種類", "select"],
  aliasNames: ["別名（1行に1件）", "textarea"], youtubeUrl: ["YouTubeチャンネルURL", "url"], xUrl: ["XプロフィールURL", "url"],
  displayName: ["表示名", "text"], activity: ["活動状態", "select"], officialProfileUrl: ["公式プロフィールURL", "url"],
  startsAt: ["販売開始（日本時間）", "datetime-local"], endsAt: ["販売終了（日本時間）", "datetime-local"],
  month: ["月", "number"], day: ["日", "number"], year: ["年（任意）", "number"], kind: ["記念日の種類", "select"],
  title: ["名称", "text"], venue: ["会場", "text"], summary: ["概要", "textarea"],
  starts: ["開始日時（日本時間）", "datetime-local"], ends: ["終了日時（日本時間）", "datetime-local"],
  format: ["開催形式", "select"], streamUrl: ["配信URL", "url"], fee: ["料金", "number"],
  announcementUrl: ["公式告知URL", "url"], image: ["商品画像URL", "url"],
  identityUrl: ["公式商品情報URL", "url"], url: ["販売ページURL", "url"], price: ["価格（円）", "number"],
};
const categories = {
  video: { category: "music", label: "動画情報", fields: ["videoUrl"] },
  karaoke: { category: "music", label: "歌枠", fields: ["videoUrl"] },
  song: { category: "music", label: "楽曲", fields: ["title", "artists", "aliases", "readings"], ownerCreate: true },
  musicVideo: { category: "music", label: "歌動画", fields: ["rawSongTitle", "videoUrl", "videoKind"] },
  talent: { category: "talents", label: "VTuber", fields: ["displayName", "image", "activity", "officialProfileUrl", "aliasNames", "youtubeUrl", "xUrl"] },
  campaign: { category: "goods", label: "キャンペーン", fields: ["title"] },
  anniversary: { category: "anniversaries", label: "記念日", fields: ["title", "kind", "month", "day", "year"] },
  event: { category: "events", label: "イベント", fields: ["title", "announcementUrl", "summary", "venue", "starts", "ends", "format", "streamUrl", "fee"] },
  product: { category: "goods", label: "グッズ", fields: ["title", "image", "identityUrl"] },
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
  function songPicker(select, selected) {
    const search = el("input");
    search.type = "search";
    const label = el("label", "曲名・原曲アーティストで検索");
    label.append(search);
    const refresh = (current) => {
      const query = search.value.trim().normalize("NFKC").toLocaleLowerCase("ja");
      select.replaceChildren(new Option("紐づけなし", ""), ...catalog.songs.filter(({ id, name }) =>
        id === current || name.normalize("NFKC").toLocaleLowerCase("ja").includes(query),
      ).map(({ id, name }) => new Option(name, id)));
      select.value = current || "";
    };
    refresh(selected);
    search.oninput = () => refresh(select.value);
    return label;
  }

  const formArea = el("section");
  const list = el("section");
  const draftsArea = el("section");
  panel.append(draftsArea, formArea, list);
  const publicationArea = el("section");
  const publicationStatus = el("p");
  const publishedRecords = el("details");
  publishedRecords.hidden = true;
  publicationStatus.setAttribute("role", "status");
  const selectedDrafts = new Set();
  let publication;
  if (catalog.editable && catalog.publicationTracking !== false) {
    publicationArea.append(el("h3", "公開状況"), publicationStatus, publishedRecords);
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
  if (catalog.editable && catalog.publicationTracking !== false) {
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
  async function refreshDrafts() {
    saved = await api("/api/cms/draft");
    revision = saved.revision;
    draftsArea.replaceChildren(el("h3", "保存済みの下書き"));
    const eligible = new Set(saved.drafts.filter(({ conflict, reapplyJobId }) => !conflict && !reapplyJobId).map(({ draftId }) => draftId));
    for (const draftId of selectedDrafts) if (!eligible.has(draftId)) selectedDrafts.delete(draftId);
    if (catalog.publishable) {
      const publish = button("選択した下書きを公開", async () => {
        if (!selectedDrafts.size) return;
        publish.disabled = true;
        try {
          await api("/api/cms/publication", "POST", {
            draftIds: [...selectedDrafts], revision, retry: publication?.phase === "failed",
          });
          await refreshPublication();
        } catch (error) {
          publicationStatus.textContent = error.message === "cms_publication_busy"
            ? "別の公開処理が進行中です。完了後にもう一度お試しください。"
            : error.message === "cms_draft_already_applied"
              ? "この下書きには公開済みの新規登録が含まれます。保存済みの内容を確認し、登録済みのレコードを開いて変更を再適用してください。"
              : "公開を開始できませんでした。下書きを確認してください。";
        } finally {
          publish.disabled = false;
        }
      });
      draftsArea.append(el("p", "公開する下書きを選んでください。"), publish);
    }
    for (const { draftId, input, conflict, reapplyJobId } of saved.drafts) {
      const row = el("div");
      row.className = "button-group";
      if (catalog.publishable && !conflict && !reapplyJobId) {
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedDrafts.has(draftId);
        checkbox.onchange = () => checkbox.checked ? selectedDrafts.add(draftId) : selectedDrafts.delete(draftId);
        const label = el("label", "公開する");
        checkbox.setAttribute("aria-label", (input.title || input.displayName || input.rawSongTitle) + "を公開する");
        label.prepend(checkbox);
        row.append(label);
      }
      if (conflict) row.append(el("p", (input?.title || "下書き") + "：元の情報が変更されたか、現在の担当範囲外です。"));
      else row.append(button(input.title || input.displayName || input.rawSongTitle, () => edit(input.entity, input, draftId)));
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
            status.textContent = "発行済みレコードに紐づけた下書きを保存しました。";
          } catch {
            status.textContent = "自動で再適用できませんでした。下書きを保持しています。";
          }
        }));
      }
      row.append(button("この下書きを破棄", async () => {
        if (!confirm("この下書きを破棄しますか？")) return;
        try {
          await api("/api/cms/draft", "DELETE", { draftId, revision });
          if (formArea.dataset.draftId === draftId) {
            formArea.replaceChildren();
            delete panel.dataset.cmsDirty;
          }
          await refreshDrafts();
        } catch {
          status.textContent = "下書きを破棄できませんでした。";
        }
      }));
      draftsArea.append(row);
    }
  }
  function edit(entity, input = {}, draftId) {
    if (panel.dataset.cmsDirty && !confirm("保存していない入力を破棄して別の編集を開きますか？")) return;
    const spec = categories[entity];
    const form = el("form");
    form.className = "stack";
    const fields = new Map();
    function add(key, label, control) {
      const wrapping = el("label", label);
      control.value = input[key] ?? (["format", "activity"].includes(key) ? "unknown" : key === "kind" ? "birthday" : "");
      wrapping.append(control);
      form.append(wrapping);
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
    if (entity === "song" && !input.id) fieldNames.push("songIdentityUrl");
    if (entity === "video" && input.id) fieldNames.push("title");
    for (const key of fieldNames) {

      const [label, type] = labels[key];
      const control = el(["textarea", "select"].includes(type) ? type : "input");
      if (type === "select") control.append(...Object.entries(key === "videoKind" ? { cover: "歌ってみた", original: "オリジナル", other: "その他" } : key === "activity" ? { unknown: "不明", active: "活動中", hiatus: "休止中", retired: "引退", ended: "活動終了" } : key === "kind" ? { birthday: "誕生日", debut: "デビュー記念日", group: "グループ記念日", other: "その他" } : {
        unknown: "未定・不明", onsite: "会場開催", online: "オンライン", hybrid: "会場とオンライン",
      }).map(([value, text]) => new Option(text, value)));
      else if (type !== "textarea") control.type = type;
      if (entity === "video" && input.id && key === "videoUrl") control.readOnly = true;
      control.required = ["month", "day"].includes(key) || ["title", "displayName", "rawSongTitle", "videoUrl", "videoKind"].includes(key) || key === "announcementUrl" || key === "summary" || key === "identityUrl" || key === "songIdentityUrl";
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
    if ((!input.id && !["campaign", "song", "video"].includes(entity)) || entity === "talent") {
      const key = ["talent", "event"].includes(entity) ? "organization" : "talent";
      const choices = key === "organization" ? catalog.organizations : catalog.people;
      const search = el("input");
      search.type = "search";
      const searchLabel = el("label", "候補を絞り込む");
      searchLabel.append(search);
      form.append(searchLabel);
      const select = el("select");
      select.required = !input.id;
      function fill(query = "", active = input[key]) {
        select.replaceChildren(new Option("選択してください", ""), ...choices
          .filter((row) => row.name.includes(query) || row.id === active)
          .map((row) => new Option(row.name, row.id)));
        select.value = active || "";
      }
      fill();
      add(key, key === "organization" ? "関連事務所" : "関連する人物", select);
      search.oninput = () => fill(search.value, select.value);
    }
    if (entity === "product" && !input.id) {
      const campaigns = catalog.sections.find(({ entity }) => entity === "campaign")?.items || [];
      const select = el("select");
      select.append(new Option("キャンペーンなし／新規", ""), ...campaigns.map(
        ({ id, title }) => new Option(title, id),
      ));
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
          const label = el("label", text);
          label.append(control);
          control.value = value[name] || "";
          row.append(label);
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
          campaign.append(new Option("キャンペーンなし", ""), ...(catalog.sections
            .find(({ entity }) => entity === "campaign")?.items || [])
            .map(({ id, title }) => new Option(title, id)));
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
          const label = el("label", text);
          control.value = value[name] || "";
          control.required = required;
          label.append(control);
          row.append(label);
          controls.set(name, control);
        }
        for (const name of ["title", "identityUrl", "image"]) {
          const control = el("input");
          control.type = labels[name][1];
          field(name, name === "title" ? "商品名" : labels[name][0], control, name !== "image");
        }
        if (!value.id) {
          const select = el("select");
          select.append(new Option("選択してください", ""), ...catalog.people.map(
            ({ id, name }) => new Option(name, id),
          ));
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
    if (entity === "event") {
      const performers = el("fieldset");
      performers.append(el("legend", "出演者"));
      for (const person of catalog.people) {
        const label = el("label", person.name);
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.name = "performer";
        checkbox.value = person.id;
        checkbox.checked = input.performers?.includes(person.id) ?? false;
        label.prepend(checkbox);
        performers.append(label);
      }
      form.append(performers);
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
        const songLabel = el("label", "既存の楽曲");
        songLabel.append(song);
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
        row.append(label, songSearch, songLabel, work.details, ...times.map(({ field }) => field), button("上へ", () => move(-1)), button("下へ", () => move(1)));
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
    const submit = el("button", "下書きを保存");
    submit.disabled = !saveAvailable;
    form.append(submit);
    let inputRevision = 0;
    const markDirty = () => {
      inputRevision++;
      panel.dataset.cmsDirty = "true";
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("click", (event) => {
      if (event.target.closest('button[type="button"]')) markDirty();
    });
    form.onsubmit = async (event) => {
      event.preventDefault();
      const submittedInputRevision = inputRevision;
      submit.disabled = true;
      try {
        const values = Object.fromEntries([...fields].map(([key, control]) => [key, control.value]));
        if (entity === "event") {
          const checked = new Set(new FormData(form).getAll("performer"));
          values.performers = [
            ...(input.performers || []).filter((id) => checked.delete(id)),
            ...checked,
          ];
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
          entity, id: input.id, draftId, sha: input.sha || catalog.sha, revision, ...values,
        });
        revision = result.revision;
        draftId = result.draftId;
        formArea.dataset.draftId = draftId;
        if (inputRevision === submittedInputRevision) delete panel.dataset.cmsDirty;
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
    delete panel.dataset.cmsDirty;
    formArea.dataset.draftId = draftId || "";
    formArea.replaceChildren(el("h3", spec.label + (input.id ? "を編集" : "を登録")), form);
    form.querySelector("input")?.focus();
  }
  if (saved) await refreshDrafts();
  panel.append(mountCmsHistory({ api, editable: catalog.editable, revision: () => revision, afterSave: refreshDrafts }));
  for (const [entity, spec] of Object.entries(categories)) {
    if ((!spec.ownerCreate || catalog.owner) && catalog.editable && catalog.categories.includes(spec.category))
      list.append(button(spec.label + "を新規登録", () => edit(entity)));
  }
  const tools = el("div");
  tools.className = "button-group";
  const category = el("select");
  const search = el("input");
  const order = el("select");
  search.type = "search";
  search.placeholder = "名称を検索";
  search.setAttribute("aria-label", "名称を検索");
  category.setAttribute("aria-label", "コンテンツの種類");
  order.setAttribute("aria-label", "並び順");
  category.append(new Option("すべての種類", ""), ...catalog.sections.map(
    ({ entity, label }) => new Option(label, entity),
  ));
  order.append(new Option("登録順", ""), new Option("名前順", "name"));
  tools.append(category, search, order);
  list.append(tools);
  const views = [];
  const collator = new Intl.Collator("ja");
  function filter() {
    const needle = search.value.trim().normalize("NFKC").toLocaleLowerCase("ja");
    for (const { entity, section, entries, rows } of views) {
      const matching = rows.filter(({ title }) => title.normalize("NFKC").toLocaleLowerCase("ja").includes(needle));
      if (order.value === "name") matching.sort((a, b) => collator.compare(a.title, b.title));
      entries.replaceChildren(...matching.map(({ li }) => li));
      section.hidden = Boolean(category.value && category.value !== entity) || matching.length === 0;
    }
  }
  search.addEventListener("input", filter);
  category.addEventListener("change", filter);
  order.addEventListener("change", filter);
  async function openRecord(entity, id) {
    try {
      const query = new URLSearchParams({ entity, id });
      const { fields, sha } = await api("/api/cms/detail?" + query);
      edit(entity, { ...fields, id, sha });
    } catch {
      status.textContent = "この項目は簡易フォームで編集できません。";
    }
  }

  for (const { entity, label, items } of catalog.sections) {
    const section = el("section");
    const entries = el("ul");
    const rows = [];
    for (const item of items) {
      const li = el("li");
      if (!catalog.editable || !Object.hasOwn(categories, entity)) li.textContent = item.title;
      else li.append(button(item.title, () => openRecord(entity, item.id)));
      rows.push({ title: item.title || "名称未登録", li });
    }
    section.append(el("h3", label), entries);
    list.append(section);
    views.push({ entity, section, entries, rows });
  }
  filter();
  if (saveAvailable) status.textContent = "担当範囲の公開コンテンツです。";
}
