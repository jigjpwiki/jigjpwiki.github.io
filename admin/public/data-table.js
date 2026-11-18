import { el, action } from "./controls.js";
export const normalize = (v) =>
  String(v ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
const collator = new Intl.Collator("ja", { numeric: true });
export function tableRows(
  rows,
  columns,
  { query = "", filters = {}, sort = null, descending = false } = {},
) {
  const selected = rows.filter(
    (r) =>
      (!query ||
        normalize(
          columns.map((c) => (c.search ? c.search(r) : c.get(r))).join(" "),
        ).includes(normalize(query))) &&
      columns.every(
        (c) => !filters[c.key] || String(c.get(r) ?? "") === filters[c.key],
      ),
  );
  if (sort) {
    const c = columns.find((c) => c.key === sort);
    if (c)
      selected.sort(
        (a, b) =>
          collator.compare(
            String(c.sort?.(a) ?? c.get(a) ?? ""),
            String(c.sort?.(b) ?? c.get(b) ?? ""),
          ) * (descending ? -1 : 1),
      );
  }
  return selected;
}
export function changedValue(row, column, raw) {
  const value = column.parse ? column.parse(raw) : raw;
  if (column.options && !column.options.some(([v]) => v === value))
    throw Error("選択肢から選んでください。");
  const next = structuredClone(row);
  delete next._reference;
  column.set(next, value);
  return next;
}
export function prepareChanges(targets, column, raw) {
  return targets.map((record) => {
    try {
      return { record, value: changedValue(record, column, raw) };
    } catch (e) {
      throw new Error(
        `${record.id || record._reference || "対象行"} / ${column.label}: ${e.message}`,
      );
    }
  });
}
export function prepareCurrentChanges(
  targets,
  current,
  column,
  raw,
  key = (r) => r.id || r._reference,
) {
  const latest = new Map(current.map((r) => [key(r), r]));
  for (const r of targets)
    if (JSON.stringify(latest.get(key(r))) !== JSON.stringify(r))
      throw Error(
        "確認中に対象の下書きが変更されました。キャンセルして対象を再確認してください。",
      );
  return prepareChanges(targets, column, raw);
}
export function confirmDialog({ title, description, onConfirm }) {
  const d = el("dialog", undefined, "confirmation-dialog"),
    h = el("h2", title),
    p = el("p", description),
    cancel = action("キャンセル", () => d.close()),
    yes = action(
      "下書きに適用",
      async () => {
        try {
          await onConfirm();
          d.close();
        } catch (e) {
          error.textContent = e.message;
        }
      },
      "submission-primary",
    ),
    error = el("p");
  h.id = "confirm-" + crypto.randomUUID();
  d.setAttribute("aria-labelledby", h.id);
  error.setAttribute("role", "alert");
  const actions = el("div", undefined, "button-group");
  actions.append(cancel, yes);
  d.append(h, p, error, actions);
  document.body.append(d);
  const previous = document.activeElement;
  d.onclose = () => {
    d.remove();
    previous?.focus();
  };
  d.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const controls = [
      ...d.querySelectorAll("button,input,select,textarea,a[href]"),
    ].filter((x) => !x.disabled);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  d.showModal();
  cancel.focus();
  return d;
}
export function mountDataTable({
  container,
  title,
  columns,
  rows,
  key = (r) => r.id || r._reference,
  baseline = () => null,
  onChange,
  onOpen,
  openLabel,
  filters: extraFilters = [],
  onError = () => {},
  pageSize = 50,
  queryLabel,
}) {
  const state = {
      query: "",
      filters: {},
      sort: null,
      descending: false,
      page: 0,
      selectedOnly: false,
    },
    selected = new Set(),
    visible = new Set(columns.filter((c) => !c.hidden).map((c) => c.key)),
    widths = new Map();
  const root = el("div", undefined, "data-table"),
    tools = el("div", undefined, "table-toolbar"),
    query = el("input"),
    count = el("p", undefined, "table-count"),
    scroll = el("div", undefined, "table-scroll"),
    table = el("table"),
    pager = el("div", undefined, "table-pager"),
    bulk = el("div", undefined, "table-bulk"),
    errors = el("p", undefined, "field-error");
  root.dataset.dataTable = title;
  query.type = "search";
  query.placeholder = "名前・タイトルで検索";
  query.setAttribute(
    "aria-label",
    queryLabel || (title === "VTuber" ? "名前・IDで検索" : "タイトルで検索"),
  );
  count.setAttribute("role", "status");
  errors.setAttribute("role", "alert");
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", title + "一覧（横スクロール可能）");
  table.setAttribute("aria-label", title + "一覧");
  scroll.append(table);
  const settings = el("details"),
    summary = el("summary", "列表示・列幅");
  settings.append(summary);
  const settingsBox = el("div", undefined, "column-settings");
  settings.append(settingsBox);
  for (const c of columns) {
    const label = el("label"),
      check = el("input");
    check.type = "checkbox";
    check.checked = visible.has(c.key);
    check.onchange = () => {
      check.checked ? visible.add(c.key) : visible.delete(c.key);
      draw();
    };
    label.append(check, document.createTextNode(c.label + "列を表示"));
    const range = el("input");
    range.type = "range";
    range.min = 100;
    range.max = 520;
    range.value = c.width || 160;
    range.setAttribute("aria-label", c.label + "の列幅");
    range.oninput = () => {
      widths.set(c.key, +range.value);
      draw();
    };
    settingsBox.append(label, range);
  }
  const filterDetails = el("details", undefined, "table-filter-details"),
    filterSummary = el("summary", "詳細条件"),
    filterControls = el("div", undefined, "table-filter-controls");
  filterDetails.append(filterSummary, filterControls);
  filterDetails.open = matchMedia("(min-width: 768px)").matches;
  tools.append(query, filterDetails);
  const extra = [];
  for (const f of [
    ...columns
      .filter((c) => c.filter)
      .map((c) => ({
        label: c.filterLabel || c.label,
        key: c.key,
        options:
          c.options ||
          [...new Set(rows().map((r) => c.get(r)))].map((v) => [v, String(v)]),
        test: (r, v) => String(c.get(r)) === v,
      })),
    ...extraFilters,
  ]) {
    const select = el("select");
    select.setAttribute("aria-label", "一覧の" + f.label);
    select.append(new Option(f.label + "：すべて", ""));
    for (const [v, n] of f.options) select.append(new Option(n, v));
    select.onchange = () => {
      state.filters[f.key] = select.value;
      state.page = 0;
      draw();
    };
    f.control = select;
    extra.push(f);
    filterControls.append(select);
  }
  const clear = action("条件を解除", () => {
    state.query = query.value = "";
    state.filters = {};
    state.page = 0;
    extra.forEach((f) => (f.control.value = ""));
    draw();
  });
  tools.append(clear, settings);
  const all = action("検索結果を全件選択", () => {
      for (const r of filtered()) selected.add(key(r));
      draw();
    }),
    none = action("選択解除", () => {
      selected.clear();
      draw();
    });
  let selectionPage = 0;
  const selectedOnly = action("選択中の項目だけを表示", () => {
      state.selectedOnly = !state.selectedOnly;
      state.page = 0;
      draw();
    }),
    selectionDetails = el("details"),
    selectionSummary = el("summary"),
    selectionList = el("ul");
  const selectionPager = el("div", undefined, "row");
  selectionDetails.append(selectionSummary, selectionList, selectionPager);
  const field = el("select"),
    valueBox = el("span"),
    selectionCount = el("span");
  field.setAttribute("aria-label", "一括変更する項目");
  const editable = columns.filter((c) => c.set && c.bulk);
  editable.forEach((c) => field.append(new Option(c.label, c.key)));
  let bulkInput;
  const drawBulkValue = () => {
    const c = editable.find((c) => c.key === field.value);
    if (!c) return;
    bulkInput = makeInput(c, "");
    bulkInput.setAttribute("aria-label", "一括変更後の値");
    valueBox.replaceChildren(bulkInput);
  };
  field.onchange = drawBulkValue;
  drawBulkValue();
  const apply = action("選択行に一括適用", () => {
    const c = editable.find((c) => c.key === field.value),
      targets = structuredClone(rows().filter((r) => selected.has(key(r))));
    if (!targets.length || !c) return;
    if (targets.length > 120) {
      errors.textContent =
        "一括変更は120件以下に分けてください。選択と入力は保持しています。";
      onError(new Error("bulk_operation_limit"));
      return;
    }
    errors.textContent = "";
    const raw = bulkInput.value;
    const dialog = confirmDialog({
      title: `${targets.length}件の${c.label}を変更`,
      description: `${targets
        .slice(0, 5)
        .map((r) => columns[0].get(r))
        .join(
          "、",
        )}${targets.length > 5 ? " ほか" : ""} → ${c.options?.find(([v]) => v === bulkInput.value)?.[1] || bulkInput.value}。下書きのみ変更し、PRは作成しません。`,
      onConfirm: () => {
        const changes = prepareCurrentChanges(targets, rows(), c, raw, key);
        onChange(changes);
        draw();
      },
    });
    const names = el("details"),
      heading = el("summary", "全対象を確認"),
      list = el("ul");
    list.append(
      ...targets.map((r) => el("li", String(columns[0].get(r) || key(r)))),
    );
    names.append(heading, list);
    dialog.insertBefore(names, dialog.querySelector("[role=alert]"));
  });
  bulk.append(all, none, selectionCount, selectedOnly, selectionDetails);
  if (editable.length) bulk.append(field, valueBox, apply);
  const hint = el(
    "p",
    "セルは矢印で移動、Enterで編集・確定、Escで取消。",
    "table-keyboard-hint",
  );
  hint.id = "table-help-" + crypto.randomUUID();
  table.setAttribute("aria-describedby", hint.id);
  root.append(tools, bulk, errors, count, hint, scroll, pager);
  table.addEventListener("focusin", (e) => {
    const cell = e.target.closest("td[data-column]");
    if (!cell) return;
    table
      .querySelectorAll("td[data-column]")
      .forEach((td) => (td.tabIndex = td === cell ? 0 : -1));
  });
  container.replaceChildren(root);
  let composing = false;
  query.oncompositionstart = () => (composing = true);
  query.oncompositionend = () => {
    composing = false;
    state.query = query.value;
    state.page = 0;
    draw();
  };
  query.oninput = (e) => {
    if (!composing && !e.isComposing) {
      state.query = query.value;
      state.page = 0;
      draw();
    }
  };
  function filtered(snapshot = rows()) {
    if (state.selectedOnly)
      return tableRows(
        snapshot.filter((r) => selected.has(key(r))),
        columns,
        { ...state, query: "", filters: {} },
      );
    return tableRows(
      snapshot
        .filter((r) => !state.selectedOnly || selected.has(key(r)))
        .filter((r) =>
          extra.every(
            (f) => !state.filters[f.key] || f.test(r, state.filters[f.key]),
          ),
        ),
      columns,
      { ...state, filters: {} },
    );
  }
  function makeInput(c, value) {
    const input = el(c.options ? "select" : "input");
    if (c.options) {
      for (const [v, n] of c.options) input.append(new Option(n, v));
    } else input.type = c.type || "text";
    input.value = value ?? "";
    if (c.options && input.selectedIndex < 0) {
      if (value !== "" && value !== null && value !== undefined) {
        input.append(new Option("現在値（要確認）：" + value, value));
        input.value = value;
      } else input.selectedIndex = 0;
    }
    return input;
  }
  let pendingCell;
  function editCell(td, r, c) {
    if (!c.set) return;
    if (pendingCell?.td.isConnected && !pendingCell.done) {
      const pending = pendingCell;
      pending.commit();
      if (!pending.done) {
        pendingCell.td.querySelector("input,select")?.focus();
        return;
      }
    }
    const old = c.get(r),
      input = makeInput(c, old),
      err = el("span", undefined, "field-error");
    input.setAttribute("aria-label", `${columns[0].get(r)}：${c.label}`);
    err.id = "cell-error-" + crypto.randomUUID();
    input.setAttribute("aria-describedby", err.id);
    let done = false;
    const commit = () => {
      if (done) return;
      if (!input.checkValidity()) {
        err.textContent = input.validationMessage;
        input.setAttribute("aria-invalid", "true");
        return;
      }
      try {
        const next = changedValue(r, c, input.value);
        onChange([{ record: r, value: next }]);
        done = true;
        draw();
        focusCell(key(r), c.key);
      } catch (e) {
        err.textContent = e.message;
        input.setAttribute("aria-invalid", "true");
      }
    };
    td.dataset.uncommittedCell = "";
    pendingCell = {
      td,
      commit,
      get done() {
        return done;
      },
    };
    err.setAttribute("role", "alert");
    const announce = () => document.dispatchEvent(new Event("inline-state"));
    td.replaceChildren(input, err);
    announce();
    input.focus();
    input.select?.();
    input.onkeydown = (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done = true;
        draw();
        focusCell(key(r), c.key);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        commit();
        if (done) {
          const cells = [...table.querySelectorAll("td[data-column]")],
            i = cells.findIndex(
              (t) =>
                t.dataset.row === String(key(r)) && t.dataset.column === c.key,
            ),
            next = cells[i + (e.shiftKey ? -1 : 1)];
          if (next) next.focus();
          else table.querySelector("tbody .record-open")?.focus();
        }
      }
    };
    input.onblur = commit;
  }
  function focusCell(id, column) {
    [...table.querySelectorAll("td[data-column]")]
      .find(
        (td) => td.dataset.row === String(id) && td.dataset.column === column,
      )
      ?.focus();
  }
  function draw() {
    if (pendingCell?.td.isConnected && !pendingCell.done) {
      const pending = pendingCell;
      pending.commit();
      if (!pending.done) return;
    }
    pendingCell = undefined;
    const snapshot = rows(),
      list = filtered(snapshot);
    state.page = Math.min(
      state.page,
      Math.max(0, Math.ceil(list.length / pageSize) - 1),
    );
    const current = list.slice(
        state.page * pageSize,
        (state.page + 1) * pageSize,
      ),
      cols = columns.filter((c) => visible.has(c.key));
    count.textContent =
      `${list.length}件 / 登録${snapshot.length}件` +
      (snapshot.some((r) => "visibility" in r)
        ? `（公開${snapshot.filter((r) => r.visibility === "public").length}件）`
        : "");
    const visibleKeys = new Set(list.map(key)),
      hiddenSelection = [...selected].filter(
        (id) => !visibleKeys.has(id),
      ).length;
    const chosen = snapshot.filter((r) => selected.has(key(r)));
    selectionPage = Math.min(
      selectionPage,
      Math.max(0, Math.ceil(chosen.length / 50) - 1),
    );
    selectionList.replaceChildren(
      ...chosen
        .slice(selectionPage * 50, (selectionPage + 1) * 50)
        .map((r) =>
          el("li", `${columns[0].get(r) || "名称未入力"}（${key(r)}）`),
        ),
    );
    selectionPager.replaceChildren(
      action("選択対象の前ページ", () => {
        selectionPage = Math.max(0, selectionPage - 1);
        draw();
      }),
      el(
        "span",
        `${selectionPage + 1} / ${Math.max(1, Math.ceil(chosen.length / 50))}`,
      ),
      action("選択対象の次ページ", () => {
        if ((selectionPage + 1) * 50 < chosen.length) selectionPage++;
        draw();
      }),
    );
    selectionSummary.textContent = `選択対象を確認（${selected.size}件）`;
    selectedOnly.textContent = state.selectedOnly
      ? "すべての行を表示"
      : "選択中の項目だけを表示";
    selectedOnly.setAttribute("aria-pressed", String(state.selectedOnly));
    selectionCount.textContent =
      `${selected.size}件選択` +
      (hiddenSelection ? `（条件外${hiddenSelection}件を含む）` : "");
    apply.disabled = !selected.size;
    field.hidden = valueBox.hidden = apply.hidden = !selected.size;
    const head = el("thead"),
      tr = el("tr"),
      th = el("th"),
      check = el("input");
    check.type = "checkbox";
    check.setAttribute("aria-label", "このページの行を選択");
    check.checked =
      current.length > 0 && current.every((r) => selected.has(key(r)));
    check.indeterminate =
      current.some((r) => selected.has(key(r))) && !check.checked;
    check.onchange = () => {
      current.forEach((r) =>
        check.checked ? selected.add(key(r)) : selected.delete(key(r)),
      );
      draw();
    };
    const pageLabel = el("label", undefined, "row-select");
    pageLabel.append(check);
    th.append(pageLabel);
    tr.append(th);
    for (const c of cols) {
      const th = el("th");
      th.scope = "col";
      th.style.width = (widths.get(c.key) || c.width || 160) + "px";
      th.setAttribute(
        "aria-sort",
        state.sort === c.key
          ? state.descending
            ? "descending"
            : "ascending"
          : "none",
      );
      th.append(
        action(c.label, () => {
          state.descending = state.sort === c.key ? !state.descending : false;
          state.sort = c.key;
          draw();
        }),
      );
      tr.append(th);
    }
    tr.append(el("th", "操作"));
    head.append(tr);
    const body = el("tbody");
    for (const r of current) {
      const tr = el("tr");
      tr.dataset.row = key(r);
      const selectCell = el("td"),
        cb = el("input");
      cb.type = "checkbox";
      cb.checked = selected.has(key(r));
      cb.setAttribute("aria-label", columns[0].get(r) + "を選択");
      cb.onchange = () => {
        cb.checked ? selected.add(key(r)) : selected.delete(key(r));
        draw();
      };
      const rowLabel = el("label", undefined, "row-select");
      rowLabel.append(cb);
      selectCell.append(rowLabel);
      tr.append(selectCell);
      for (const c of cols) {
        const td = el("td");
        td.tabIndex =
          current.indexOf(r) === 0 && cols.indexOf(c) === 0 ? 0 : -1;
        td.dataset.row = key(r);
        td.dataset.column = c.key;
        const raw = c.get(r),
          before = baseline(r);
        const display =
          c.format?.(r) ??
          c.options?.find(([v]) => v === raw)?.[1] ??
          raw ??
          "未登録";
        const changed =
          before && JSON.stringify(c.get(before)) !== JSON.stringify(raw);
        if (changed) {
          td.classList.add("changed-cell");
          td.title = `変更前：${c.get(before) ?? "未登録"} → ${raw ?? "未登録"}`;
        }
        if (c.set) {
          const b = action(
            String(display || "未登録") + (changed ? " •" : ""),
            () => editCell(td, r, c),
            "cell-editor",
          );
          b.tabIndex = -1;
          b.setAttribute(
            "aria-label",
            `${columns[0].get(r)}：${c.label}を編集${changed ? "（下書き変更あり）" : ""}`,
          );
          td.append(b);
        } else if (c.render) td.append(c.render(r));
        else td.textContent = String(display);
        td.onkeydown = (e) => {
          if (e.target !== td) return;
          if (e.key === "Enter" && c.set) {
            e.preventDefault();
            editCell(td, r, c);
          } else if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            const cells = [...tr.querySelectorAll("td[data-column]")],
              i = cells.indexOf(td);
            if (e.key === "ArrowLeft") cells[i - 1]?.focus();
            if (e.key === "ArrowRight") cells[i + 1]?.focus();
            if (e.key === "ArrowUp")
              tr.previousElementSibling
                ?.querySelectorAll("td[data-column]")
                [i]?.focus();
            if (e.key === "ArrowDown")
              tr.nextElementSibling
                ?.querySelectorAll("td[data-column]")
                [i]?.focus();
          }
        };
        tr.append(td);
      }
      const ops = el("td"),
        actions = el("div", undefined, "record-actions");
      ops.append(actions);
      const old = baseline(r);
      if (
        old &&
        columns.some(
          (c) => JSON.stringify(c.get(old)) !== JSON.stringify(c.get(r)),
        )
      ) {
        const detail = el("details"),
          summary = el("summary", "変更前後");
        detail.append(summary);
        detail.ontoggle = () => {
          if (!detail.open || detail.children.length > 1) return;
          for (const c of columns)
            if (JSON.stringify(c.get(old)) !== JSON.stringify(c.get(r)))
              detail.append(
                el(
                  "p",
                  c.label +
                    "：" +
                    String(c.get(old) ?? "未登録") +
                    " → " +
                    String(c.get(r) ?? "未登録"),
                ),
              );
        };
        actions.append(detail);
      }
      const openButton = action("詳細", () => onOpen(r), "record-open");
      openButton.setAttribute(
        "aria-label",
        openLabel?.(r) || String(columns[0].get(r)),
      );
      actions.append(openButton);
      tr.append(ops);
      body.append(tr);
    }
    table.replaceChildren(head, body);
    if (!list.length) {
      const p = el(
        "caption",
        "該当する登録はありません。条件を解除してください。",
      );
      table.append(p);
    }
    const prev = action("前へ", () => {
        state.page--;
        draw();
      }),
      next = action("次へ", () => {
        state.page++;
        draw();
      });
    prev.disabled = !state.page;
    next.disabled = (state.page + 1) * pageSize >= list.length;
    document.dispatchEvent(new Event("inline-state"));
    pager.replaceChildren(
      prev,
      el(
        "span",
        `${state.page + 1} / ${Math.max(1, Math.ceil(list.length / pageSize))}ページ（50件ずつ）`,
      ),
      next,
    );
  }
  draw();
  return {
    refresh: draw,
    get selected() {
      return [...selected];
    },
    get state() {
      return state;
    },
  };
}
