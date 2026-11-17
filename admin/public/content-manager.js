import { mountDataTable } from "./data-table.js";
import { columnsFor } from "./table-columns.js";
import { detailPanel } from "./detail-panel.js";
import { el, action, namePicker } from "./controls.js";
import { fields, labels, enums } from "./content-fields.js";
import { initialContent, reorder } from "./content-utils.js";
const categories = {
  anniversaries: "記念日",
  music: "音楽",
  events: "イベント",
  goods: "グッズ",
};
const baseTitle = (r) =>
  r?.title || r?.rawSongTitle || r?.rawLabel || r?.youtubeId || "新規登録";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function mountContent({
  container: host,
  category,
  models,
  forms,
  onPreview,
  onReload,
  onDirty,
  workspaceOperations = [],
  onWorkspaceChange,
  baseCommit,
  resumeKey,
  getWorkspaceOperations,
}) {
  let container = host;
  if (!forms?.types) {
    container.replaceChildren(
      el("p", "管理サーバーを更新してから再読み込みしてください。"),
    );
    return { dirty: false };
  }
  const types = forms.types,
    operations = workspaceOperations
      .filter((o) => forms.types[o.entity])
      .map((o) => {
        const { before, baseCommit, ...value } = o;
        return structuredClone(value);
      }),
    contexts = new Map(),
    stack = [];
  let serial = Date.now(),
    entity = Object.keys(types).find((t) => types[t].category === category),
    current = null,
    tab = "basic",
    reason = "",
    confirmed = false,
    busy = false,
    registry = new Map(),
    currentForm;
  for (const op of operations)
    if (op.parent) contexts.set(op.key, { parent: op.parent });
  const baseline = structuredClone(models);
  const title = (r) =>
    r?.productId
      ? (rowsFor("product").find((p) => p._reference === r.productId)?.title ||
          "商品未選択") +
        " / " +
        (window.Goods?.price(r.price) || "")
      : r?.youtubeId && !r.title && !r.rawSongTitle
        ? rowsFor("video").find(
            (v) => v.youtubeId === r.youtubeId || v._reference === r.youtubeId,
          )?.title || "動画未選択"
        : baseTitle(r);
  const rowsFor = (type) => {
    const t = types[type],
      rows = structuredClone(baseline[t.file][t.list]).map((r) => ({
        ...r,
        _reference: r[t.field || "id"],
      }));
    for (const op of operations.filter((o) => o.entity === type)) {
      const ref = op.id || "@" + op.key,
        index = rows.findIndex((r) => r._reference === ref),
        r = { ...structuredClone(op.value), _reference: ref };
      if (index < 0) rows.push(r);
      else rows[index] = r;
    }
    return rows;
  };
  const ref = (op) => op.id || "@" + op.key;
  const changed = () => {
    for (const field of registry.values()) {
      field.error.hidden = true;
      field.input.removeAttribute("aria-invalid");
    }
    container.querySelector("[data-content-errors]")?.remove();
    confirmed = false;
    host.querySelectorAll("[data-primary-toolbar] button").forEach((b) => {
      if (b.textContent.startsWith("一括プレビュー"))
        b.textContent = `一括プレビュー（${operations.length}件保留）`;
    });
    onDirty?.(true);
    if (onWorkspaceChange) {
      const pending = structuredClone(operations);
      if (current && !same(current.value, current.original)) {
        const op = {
          entity: current.entity,
          key: current.key,
          ...(current.id ? { id: current.id } : {}),
          value: structuredClone(current.value),
        };
        const context = contexts.get(current.key);
        if (context?.parent) op.parent = context.parent;
        const index = pending.findIndex((o) => o.key === op.key);
        if (index < 0) pending.push(op);
        else pending[index] = op;
      }
      onWorkspaceChange(
        pending.map((op) => {
          const saved = workspaceOperations.find((o) => o.key === op.key),
            t = types[op.entity];
          return {
            ...op,
            baseCommit: saved?.baseCommit || baseCommit,
            before:
              saved?.before ??
              (op.id
                ? structuredClone(
                    baseline[t.file][t.list].find(
                      (r) => r[t.field || "id"] === op.id,
                    ),
                  )
                : null),
          };
        }),
      );
    }
    const c = container.querySelector("#content-confirmed");
    if (c) c.checked = false;
  };
  const controller = {
    get dirty() {
      return (
        operations.length > 0 ||
        Boolean(current && !same(current.value, current.original))
      );
    },
    get pending() {
      return busy;
    },
    show: () => (current ? drawEditor() : drawList()),
    refresh: () => {
      if (getWorkspaceOperations) {
        operations.splice(
          0,
          operations.length,
          ...getWorkspaceOperations()
            .filter((o) => types[o.entity])
            .map(({ before, baseCommit, ...o }) => structuredClone(o)),
        );
      }
      if (current) {
        const saved = operations.find((o) => o.key === current.key);
        current.value = structuredClone(
          saved?.value ||
            baseline[types[current.entity].file][
              types[current.entity].list
            ].find(
              (r) => r[types[current.entity].field || "id"] === current.id,
            ) ||
            initialContent(current.entity, forms.schemas[current.entity]),
        );
        current.original = structuredClone(current.value);
        drawEditor();
      } else tableController?.refresh();
    },
  };
  function toolbar(inList = false) {
    const bar = el("div", undefined, "content-toolbar");
    bar.dataset.primaryToolbar = "";
    bar.append(
      action("一覧へ", () => {
        if (current && !stash()) return;
        current = null;
        drawList();
      }),
      action("最新mainを再読み込み", () => {
        if (
          !controller.dirty ||
          confirm("未提出の変更を破棄して再読み込みしますか？")
        )
          Promise.resolve(onReload()).catch(showError);
      }),
      action(`一括プレビュー（${operations.length}件保留）`, () => submit()),
      action("未提出の変更をすべて破棄", () => {
        if (
          !controller.dirty ||
          confirm("未提出の変更をすべて破棄しますか？")
        ) {
          operations.splice(0);
          contexts.clear();
          stack.splice(0);
          current = null;
          confirmed = false;
          changed();
          drawList();
        }
      }),
    );
    if (inList) {
      const more = el("details"),
        label = el("summary", "追加操作");
      more.append(label, bar.firstChild, bar.lastChild);
      bar.append(more);
    }
    return bar;
  }
  function showError(error) {
    const box =
      container.querySelector("[data-content-errors]") ||
      el("div", undefined, "error-summary");
    box.dataset.contentErrors = "";
    box.setAttribute("role", "alert");
    box.tabIndex = -1;
    box.replaceChildren(
      el("h3", "入力内容を確認してください"),
      el("p", error.message),
    );
    let targets = 0;
    for (const [path, f] of registry) {
      const suffix = path.replace(/^\//, "");
      if (error.message.includes(suffix) || error.message.includes(path)) {
        f.error.hidden = false;
        f.error.textContent = error.message;
        f.input.setAttribute("aria-invalid", "true");
        box.append(
          action(labels[path.split("/").at(-1)] || "該当項目へ", () =>
            focusField(f),
          ),
        );
        targets++;
      }
    }
    if (!targets)
      for (const op of operations)
        box.append(
          action(title(op.value) + "を確認", () =>
            open(op.entity, op.value, op.id, op.key),
          ),
        );
    if (!box.isConnected) container.prepend(box);
    box.focus();
  }
  function focusField(field) {
    const panel = field.input.closest("[data-content-tab]");
    if (panel) {
      tab = panel.dataset.contentTab;
      showTab();
    }
    field.input.focus();
  }
  function nativeValid() {
    for (const f of registry.values())
      if (!f.input.checkValidity()) {
        focusField(f);
        f.error.hidden = false;
        f.error.textContent = f.input.validationMessage;
        f.input.reportValidity();
        return false;
      }
    return true;
  }
  function stash() {
    if (!current) return true;
    if (!nativeValid()) return false;
    const op = {
      entity: current.entity,
      key: current.key,
      ...(current.id ? { id: current.id } : {}),
      value: structuredClone(current.value),
    };
    const context = contexts.get(current.key);
    if (context?.parent) op.parent = context.parent;
    const index = operations.findIndex((o) => o.key === op.key);
    if (index < 0) operations.push(op);
    else operations[index] = op;
    current.original = structuredClone(current.value);
    changed();
    return true;
  }
  function open(type, record, id, key, context) {
    key ||= "record-" + ++serial;
    const staged =
      operations.find((o) => o.key === key) ||
      (id
        ? operations.find((o) => o.entity === type && o.id === id)
        : undefined);
    if (staged) {
      key = staged.key;
      id = staged.id;
    }
    if (context) contexts.set(key, context);
    const value = structuredClone(
      staged?.value || record || initialContent(type, forms.schemas[type]),
    );
    delete value._reference;
    current = {
      entity: type,
      id,
      key,
      value,
      original: structuredClone(value),
    };
    tab = "basic";
    registry = new Map();
    if (!panel?.panel.isConnected) {
      panel = detailPanel(host, {
        title: types[type].label + "編集",
        onClose: () => {
          if (current) stash();
          current = null;
          container = host;
          host
            .querySelector("[data-primary-toolbar]")
            ?.removeAttribute("hidden");
          tableController?.refresh();
          return true;
        },
      });
    }
    container = panel.content;
    drawEditor();
  }
  function returnToParent(applyChild = true) {
    if (!stack.length) {
      current = null;
      drawList();
      return;
    }
    const child = current,
      parent = stack.pop();
    if (parent.assign && applyChild)
      parent.editor.value[parent.assign] = ref(child);
    current = parent.editor;
    tab = parent.tab;
    drawEditor();
  }
  function child(type, context = {}, assign) {
    if (!stash()) return;
    stack.push({ editor: structuredClone(current), tab, assign });
    open(type, null, null, null, context);
  }
  async function submit() {
    if (busy) return;
    if (current && !stash()) return;
    if (!operations.length) {
      showError(new Error("変更を追加してください。"));
      return;
    }
    // Review checkbox belongs to this exact staged workspace, never a previous field state.
    if (!confirmed) {
      drawReview();
      return;
    }
    busy = true;
    const controls = [
      ...container.querySelectorAll("button,input,select,textarea"),
    ].map((e) => [e, e.disabled]);
    for (const [e] of controls) e.disabled = true;
    try {
      await onPreview({ operations: structuredClone(operations) }, reason);
    } catch (e) {
      showError(e);
    } finally {
      for (const [e, disabled] of controls) e.disabled = disabled;
      busy = false;
    }
  }
  function drawReview() {
    container = host;
    host.classList.remove("with-detail", "detail-full");
    current = null;
    registry = new Map();
    container.replaceChildren(
      toolbar(),
      el("h2", "一括登録の確認"),
      el("p", "関連レコードをまとめて検証し、1本のPRへ提出します。"),
    );
    for (const op of operations) {
      const card = el("article", undefined, "array-card");
      card.append(
        el("h3", types[op.entity].label + "：" + title(op.value)),
        el("p", op.id ? "既存データの変更" : "新規登録"),
        action("編集に戻る", () => open(op.entity, op.value, op.id, op.key)),
      );
      container.append(card);
    }
    const input = el("textarea");
    input.setAttribute("aria-label", "変更理由");
    input.value = reason;
    input.oninput = () => {
      reason = input.value;
      confirmed = false;
      check.checked = false;
    };
    const check = el("input");
    check.type = "checkbox";
    check.id = "content-confirmed";
    check.onchange = () => (confirmed = check.checked);
    const label = el("label");
    label.append(
      check,
      document.createTextNode("変更内容と関連付けを確認しました"),
    );
    const preview = action("変更プレビュー", async () => {
      if (!check.checked) {
        showError(new Error("変更内容を確認してください。"));
        return;
      }
      preview.disabled = true;
      try {
        await submit();
      } finally {
        preview.disabled = false;
      }
    });
    container.append(el("label", "変更理由（任意）"), input, label, preview);
  }
  function relatedPanel(op) {
    const box = el("section", undefined, "content-related");
    box.append(el("h3", "関連レコード"));
    const reference = ref(op),
      type = op.entity;
    let linked = [];
    if (type === "campaign") {
      const offers = rowsFor("offer").filter((o) => o.campaignId === reference),
        ids = new Set(offers.map((o) => o.productId));
      const ps = rowsFor("product").filter(
        (p) =>
          ids.has(p._reference) ||
          contexts.get(operations.find((o) => ref(o) === p._reference)?.key)
            ?.parent?.reference === reference,
      );
      box.append(el("p", `${ps.length}商品 / ${offers.length}販売情報`));
      if (window.Goods)
        box.append(
          el(
            "p",
            "公開分：" +
              window.Goods.aggregate(
                offers.filter((o) => o.visibility === "public"),
              ).label,
          ),
        );
      const names = [...new Set(ps.flatMap((p) => p.talentIds))]
        .map(
          (id) => models.talents.talents.find((t) => t.id === id)?.displayName,
        )
        .filter(Boolean);
      if (names.length) box.append(el("p", names.join("・")));
      const groupNames = [...new Set(ps.flatMap((p) => p.groupIds))]
        .map((id) => models.catalog.groups.find((g) => g.id === id)?.name)
        .filter(Boolean);
      if (groupNames.length) box.append(el("p", groupNames.join("・")));
      box.append(
        action("商品を追加", () =>
          child("product", { parent: { entity: "campaign", reference } }),
        ),
      );
      linked = ps.map((r) => ["product", r]);
    } else if (type === "product") {
      const offers = rowsFor("offer").filter((o) => o.productId === reference);
      box.append(
        action("販売情報を追加", () =>
          child("offer", {
            parent: { entity: "product", reference },
            preset: {
              productId: reference,
              campaignId: contexts.get(op.key)?.parent?.reference || null,
            },
          }),
        ),
      );
      linked = offers.map((r) => ["offer", r]);
    } else if (type === "karaoke") {
      const performances = rowsFor("performance")
        .filter((p) => p.karaokeId === reference)
        .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      box.append(
        action("歌唱記録を追加", () =>
          child("performance", {
            parent: { entity: "karaoke", reference },
            preset: {
              karaokeId: reference,
              talentIds: [...op.value.talentIds],
            },
          }),
        ),
      );
      linked = performances.map((r) => ["performance", r]);
    }
    if (type === "campaign" || type === "product") {
      const kind = type === "campaign" ? "product" : "offer",
        table = el("div");
      box.append(table);
      mountDataTable({
        container: table,
        title: types[kind].label,
        rows: () =>
          rowsFor(kind).filter((r) =>
            kind === "product"
              ? linked.some(([, p]) => p._reference === r._reference)
              : r.productId === reference,
          ),
        key: (r) => r._reference,
        columns: columnsFor(kind, { models, forms, rowsFor }),
        baseline: (r) =>
          baseline[types[kind].file][types[kind].list].find(
            (b) => b.id === r._reference,
          ),
        onChange: (changes) => {
          applyTableChanges(changes, kind);
        },
        openLabel: (r) => title(r) + "を編集",
        onOpen: (r) => {
          if (!stash()) return;
          stack.push({ editor: structuredClone(current), tab });
          const staged = operations.find(
            (o) => ref(o) === r._reference && o.entity === kind,
          );
          open(
            kind,
            r,
            r.id,
            staged?.key,
            kind === "product"
              ? { parent: { entity: "campaign", reference } }
              : undefined,
          );
        },
      });
      if (type === "campaign") {
        const offersTable = el("div");
        box.append(el("h3", "キャンペーン内の販売情報"), offersTable);
        mountDataTable({
          container: offersTable,
          title: "キャンペーンの販売情報",
          rows: () =>
            rowsFor("offer").filter((o) => o.campaignId === reference),
          key: (r) => r._reference,
          columns: columnsFor("offer", { models, forms, rowsFor }),
          baseline: (r) =>
            baseline.goods.offers.find((b) => b.id === r._reference),
          onChange: (changes) => applyTableChanges(changes, "offer"),
          openLabel: (r) => title(r) + "を編集",
          onOpen: (r) => {
            if (!stash()) return;
            stack.push({ editor: structuredClone(current), tab });
            open(
              "offer",
              r,
              r.id,
              operations.find((o) => ref(o) === r._reference)?.key,
            );
          },
        });
        let existing = null;
        box.append(
          namePicker(
            "既存商品を再利用",
            null,
            rowsFor("product").map((r) => ({
              id: r._reference,
              name: r.title,
            })),
            (id) => (existing = id),
            { path: "/reuseProduct" },
          ),
          action("選んだ商品の販売情報を追加", () => {
            if (!existing) return;
            child("offer", {
              parent: { entity: "product", reference: existing },
              preset: { productId: existing, campaignId: reference },
            });
          }),
        );
      }
      if (type === "product")
        box.append(
          action("商品を複製して新規下書き", () => {
            if (!stash()) return;
            const value = structuredClone(op.value);
            delete value.id;
            value.title += "（複製）";
            value.visibility = "draft";
            value.identityUrl = "";
            stack.push({ editor: structuredClone(current), tab });
            open("product", value, null, null, contexts.get(op.key));
          }),
        );
      return box;
    }
    for (const [index, [kind, r]] of linked.entries()) {
      const row = el("article", undefined, "content-list-row");
      row.append(
        action(title(r) + "を編集", () => {
          if (!stash()) return;
          stack.push({ editor: structuredClone(current), tab });
          const staged = operations.find(
            (o) => ref(o) === r._reference && o.entity === kind,
          );
          open(
            kind,
            r,
            r.id,
            staged?.key,
            kind === "product" && type === "campaign"
              ? { parent: { entity: "campaign", reference } }
              : undefined,
          );
        }),
      );
      if (kind === "performance") {
        row.append(
          el("span", r.order === null ? "曲順未確認" : r.order + "曲目"),
        );
        const entries = linked.map(([, v]) => v),
          positions = entries.map((v) => v.order);
        for (const [delta, label] of [
          [-1, "上へ"],
          [1, "下へ"],
        ])
          if (index + delta >= 0 && index + delta < entries.length) {
            const b = action(label, () => {
              if (!stash()) return;
              reorder(entries, index, delta).forEach((v, n) => {
                const old = operations.find(
                    (o) =>
                      ref(o) === v._reference && o.entity === "performance",
                  ),
                  value = structuredClone(v);
                delete value._reference;
                value.order = positions[n];
                const op = {
                  entity: "performance",
                  key: old?.key || "record-" + ++serial,
                  ...(v.id ? { id: v.id } : {}),
                  value,
                };
                if (old) operations[operations.indexOf(old)] = op;
                else operations.push(op);
              });
              changed();
              drawEditor();
            });
            b.disabled = positions.some((p) => p === null);
            b.setAttribute("aria-label", title(r) + "を" + label);
            row.append(b);
          }
      }
      box.append(row);
    }
    return box;
  }
  function showTab() {
    for (const p of container.querySelectorAll("[data-content-tab]"))
      p.hidden = p.dataset.contentTab !== tab;
    for (const b of container.querySelectorAll("[data-tab-button]"))
      b.setAttribute("aria-pressed", String(b.dataset.tabButton === tab));
  }
  function drawEditor() {
    const op = current,
      t = types[op.entity],
      context = contexts.get(op.key);
    if (context?.preset) {
      Object.assign(op.value, structuredClone(context.preset));
      delete context.preset;
      op.original = structuredClone(op.value);
    }
    registry = new Map();
    const ph = panel?.panel.querySelector(".panel-heading h2");
    if (ph) ph.textContent = title(op.value) + " / " + (op.id || "新規下書き");
    host
      .querySelector(".list-region [data-primary-toolbar]")
      ?.setAttribute("hidden", "");
    container.replaceChildren(
      toolbar(),
      el("h2", t.label + "：" + title(op.value)),
      el(
        "p",
        op.id ? "固定ID：" + op.id : "新規登録。固定IDは検証時に発行します。",
        "field-hint",
      ),
    );
    const tabs = el("div", undefined, "editor-tabs"),
      form = el("form");
    form.onsubmit = (e) => e.preventDefault();
    currentForm = form;
    const groups = fields({
      entity: op.entity,
      record: op.value,
      schema: forms.schemas[op.entity],
      models,
      types,
      allRows: rowsFor,
      registry,
      changed,
      rerender: drawEditor,
    });
    for (const [key, name] of [
      ["basic", "基本情報"],
      ["people", "関連・出演者"],
      ["details", "日時・詳細"],
    ]) {
      const b = action(name, () => {
        tab = key;
        showTab();
      });
      b.dataset.tabButton = key;
      tabs.append(b);
      const panel = el("section");
      panel.dataset.contentTab = key;
      for (const render of groups[key]) panel.append(render());
      form.append(panel);
    }
    container.append(tabs, form);
    if (op.entity === "video" && op.id)
      registry.get("/youtubeId").input.readOnly = true;
    if (["musicVideo", "karaoke", "event"].includes(op.entity))
      container.append(
        action("動画情報を追加", () =>
          child("video", {}, op.entity === "event" ? null : "youtubeId"),
        ),
      );
    if (["musicVideo", "performance"].includes(op.entity))
      container.append(action("楽曲を追加", () => child("song", {}, "songId")));
    container.append(
      action("編集を取り消す", () => {
        if (
          same(op.value, op.original) ||
          confirm("編集中の変更を破棄しますか？")
        )
          returnToParent(false);
      }),
      relatedPanel(op),
      action("編集内容を保留", () => {
        if (stash()) returnToParent();
      }),
      action("一括登録を確認", () => {
        if (stash()) drawReview();
      }),
    );
    showTab();
  }
  let tableController, panel;
  function applyTableChanges(changes, type = entity) {
    for (const { record, value } of changes) {
      const existing = operations.find(
        (o) => ref(o) === record._reference && o.entity === type,
      );
      const op = {
        key: existing?.key || "record-" + crypto.randomUUID(),
        entity: type,
        ...(existing?.id || record[types[type].field || "id"]
          ? { id: existing?.id || record[types[type].field || "id"] }
          : {}),
        value,
      };
      if (existing?.parent) op.parent = existing.parent;
      const i = operations.findIndex((o) => o.key === op.key);
      if (i < 0) operations.push(op);
      else operations[i] = op;
    }
    changed();
  }
  function drawList() {
    container = host;
    host.classList.remove("with-detail", "detail-full");
    current = null;
    registry = new Map();
    host.replaceChildren();
    const list = el("div", undefined, "list-region");
    host.append(list);
    host.classList.add("management-layout");
    const heading = el("div", undefined, "page-header");
    heading.append(el("h2", categories[category] + "管理"));
    const menu = el("div", undefined, "content-toolbar");
    menu.setAttribute("aria-label", categories[category] + "のデータ種類");
    for (const [key, t] of Object.entries(types).filter(
      ([, t]) => t.category === category,
    )) {
      const b = action(t.label, () => {
        entity = key;
        drawList();
      });
      b.setAttribute("aria-pressed", String(key === entity));
      menu.append(b);
    }
    heading.append(
      menu,
      toolbar(true),
      action("新規" + types[entity].label + "登録", () => open(entity)),
    );
    list.append(heading);
    const result = el("div");
    list.append(result);
    tableController = mountDataTable({
      container: result,
      title: types[entity].label,
      columns: columnsFor(entity, { models, forms, rowsFor }),
      rows: () => rowsFor(entity),
      key: (r) => r._reference,
      baseline: (r) =>
        baseline[types[entity].file][types[entity].list].find(
          (b) => b[types[entity].field || "id"] === r._reference,
        ),
      onChange: applyTableChanges,
      onOpen: (r) => {
        const pending = operations.find(
          (o) => ref(o) === r._reference && o.entity === entity,
        );
        open(
          entity,
          r,
          pending?.id || r[types[entity].field || "id"],
          pending?.key,
        );
      },
      filters: [
        {
          key: "people-filter",
          label: "人物で絞り込み",
          options: models.talents.talents.map((t) => [t.id, t.displayName]),
          test: (r, id) => {
            if (entity === "campaign") {
              const ids = rowsFor("offer")
                .filter((o) => o.campaignId === r._reference)
                .map((o) => o.productId);
              return rowsFor("product").some(
                (p) => ids.includes(p._reference) && p.talentIds.includes(id),
              );
            }
            return (r.talentIds || []).includes(id);
          },
        },
      ],
    });
  }
  drawList();
  const resumed = operations.find((o) => o.key === resumeKey);
  if (resumed) open(resumed.entity, resumed.value, resumed.id, resumed.key);
  return controller;
}
