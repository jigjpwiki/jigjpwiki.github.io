import { el, action, safeLink } from "./controls.js";
import { operationDependencies } from "./workspace.js";
import { fieldChanges, fieldLabel } from "./draft.js";
const categories = {
  talent: "VTuber",
  organization: "VTuber",
  group: "VTuber",
  anniversary: "記念日",
  song: "音楽",
  musicVideo: "音楽",
  video: "音楽",
  karaoke: "音楽",
  performance: "音楽",
  event: "イベント",
  campaign: "グッズ",
  product: "グッズ",
  offer: "グッズ",
};
const title = (o) =>
  o.value?.displayName ||
  o.value?.name ||
  o.value?.title ||
  o.value?.rawSongTitle ||
  o.id ||
  "新規登録";
const text = (v) =>
  v === undefined
    ? "項目なし"
    : v === null
      ? "未登録"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
const statusLabels = {
  ready: "確認待ち",
  submitting: "提出中",
  submitted: "提出済み",
  failed: "失敗",
  open: "Open",
  closed: "Closed",
  merged: "Merged",
  running: "CI実行中",
  success: "CI成功",
  unknown: "状態未取得",
};
export function mountSubmissions({
  container,
  workspace,
  api,
  resume,
  onRefresh,
  onBack,
  onDone,
  onStatus,
  initialKeys,
  initialReason = "",
  autoPreview = false,
  mode = "changes",
}) {
  container.dataset.submissionView = "";
  let selected = new Set(initialKeys || workspace.operations.map((o) => o.key)),
    reason = initialReason,
    busy = false,
    plan,
    listOffset = 0;
  const controller = {
    get pending() {
      return busy;
    },
    get dirty() {
      return workspace.dirty;
    },
    show: () => draw(),
  };
  const stateIndicator = (text) => {
    const n = el("span", text, "submission-state");
    n.dataset.prState = "";
    return n;
  };
  function error(e) {
    for (const old of container.querySelectorAll("[data-pr-state]"))
      old.textContent = "状態を取得できませんでした。再確認してください。";
    onStatus?.(e.message);
    let box = container.querySelector("[data-submission-error]");
    if (!box) {
      box = el("div", undefined, "error-summary");
      box.dataset.submissionError = "";
      box.setAttribute("role", "alert");
      box.tabIndex = -1;
      container.prepend(box);
    }
    box.textContent = e.message;
    box.focus();
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    container.setAttribute("aria-busy", "true");
    const controls = [
      ...document.querySelectorAll(
        "#workspace-bar button,#view button,#view input,#view select,#view textarea",
      ),
    ].map((e) => [e, e.disabled]);
    for (const [e] of controls) e.disabled = true;
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      busy = false;
      for (const [e, disabled] of controls) e.disabled = disabled;
      container.removeAttribute("aria-busy");
    }
  }
  function opLabel(o) {
    return categories[o.entity] + ": " + title(o);
  }
  function compare(records) {
    const section = el("section");
    for (const record of records) {
      const details = el("details");
      details.append(
        el(
          "summary",
          (record.label || title(record)) +
            " / " +
            (record.action === "create" ? "新規登録" : "編集"),
        ),
      );
      const table = el("table"),
        head = el("tr");
      for (const h of ["項目", "変更前", "変更後"]) head.append(el("th", h));
      for (const th of head.children) th.scope = "col";
      const thead = el("thead");
      thead.append(head);
      table.append(thead);
      const body = el("tbody");
      for (const c of fieldChanges(record.before, record.value)) {
        const row = el("tr");
        row.append(
          el("th", fieldLabel(c.path)),
          el("td", text(c.before)),
          el("td", text(c.after)),
        );
        body.append(row);
      }
      table.append(body);
      const wrap = el("div", undefined, "workspace-table");
      wrap.tabIndex = 0;
      wrap.append(table);
      details.append(wrap);
      section.append(details);
    }
    return section;
  }
  function draw(focusLabel) {
    if (mode === "submitted") {
      run(list);
      return;
    }
    container.replaceChildren(
      el("h2", "変更ワークスペース"),
      el(
        "p",
        "下書き保存とPR提出は別の操作です。提出する変更だけを選択してください。",
      ),
    );
    const deps = operationDependencies(workspace.operations);
    const toolbar = el("div", undefined, "content-toolbar");
    toolbar.append(
      action("全件選択", () => {
        selected = new Set(workspace.operations.map((o) => o.key));
        draw();
      }),
      action("選択解除", () => {
        selected.clear();
        draw();
      }),
    );
    toolbar.append(
      action("関連変更も選択", () => {
        const todo = [...selected],
          seen = new Set();
        while (todo.length) {
          const key = todo.pop();
          if (seen.has(key)) continue;
          seen.add(key);
          for (const needed of deps[key] || []) {
            if (!workspace.operations.some((o) => o.key === needed)) {
              error(new Error("必要な下書きがありません: " + needed));
              return;
            }
            selected.add(needed);
            todo.push(needed);
          }
        }
        draw();
      }),
    );
    for (const cat of [
      ...new Set(workspace.operations.map((o) => categories[o.entity])),
    ])
      toolbar.append(
        action(cat + "を選択", () => {
          for (const o of workspace.operations.filter(
            (o) => categories[o.entity] === cat,
          ))
            selected.add(o.key);
          draw();
        }),
      );
    container.append(toolbar);
    const table = el("table"),
      head = el("tr");
    table.dataset.workspaceOperations = "";
    for (const h of ["選択", "種類", "対象", "検証・関連", "操作"])
      head.append(el("th", h));
    for (const th of head.children) th.scope = "col";
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const tbody = el("tbody");
    for (const op of workspace.operations) {
      const row = el("tr"),
        cell = el("td"),
        check = el("input");
      check.type = "checkbox";
      check.checked = selected.has(op.key);
      check.setAttribute("aria-label", opLabel(op) + "を提出対象にする");
      check.onchange = () => {
        if (check.checked) selected.add(op.key);
        else selected.delete(op.key);
        count.textContent = selected.size + "件選択";
      };
      const target = el("label", undefined, "submission-selection");
      target.append(check);
      cell.append(target);
      const tools = el("td");
      tools.append(
        action("編集を再開", () => resume(op)),
        action("下書きから除外", () => {
          if (confirm(title(op) + "の下書きを除外しますか？")) {
            workspace.replace(
              workspace.operations.filter((o) => o.key !== op.key),
            );
            selected.delete(op.key);
            draw();
          }
        }),
      );
      row.append(
        cell,
        el("td", categories[op.entity]),
        el("td", title(op)),
        el("td", "未検証" + (op.parent ? " / 親: " + op.parent.reference : "")),
        tools,
      );
      tbody.append(row);
    }
    table.append(tbody);
    const wrap = el("div", undefined, "workspace-table");
    wrap.tabIndex = 0;
    wrap.setAttribute("aria-label", "変更一覧");
    wrap.append(table);
    const count = el("p", selected.size + "件選択");
    count.setAttribute("role", "status");
    container.append(
      wrap,
      count,
      compare(workspace.operations.filter((o) => selected.has(o.key))),
    );
    const input = el("textarea");
    input.value = reason;
    input.setAttribute("aria-label", "変更理由");
    input.oninput = () => (reason = input.value);
    const label = el("label", "変更理由（任意）");
    label.append(input);
    container.append(
      label,
      action("選択した変更をプレビュー", () => run(preview)),
    );
    if (["failed", "conflict"].includes(workspace.state))
      container.append(
        action("保存済み下書きを読み直す", () =>
          run(async () => {
            if (
              confirm("未保存の変更を破棄して保存済み下書きを読み直しますか？")
            ) {
              await workspace.load();
              draw();
            }
          }),
        ),
      );
  }
  async function preview() {
    await workspace.flush();
    if (!selected.size) throw new Error("提出する変更を選択してください。");
    plan = await api("/api/submissions/preview", "POST", {
      protocol: 2,
      revision: workspace.revision,
      keys: [...selected],
      reason: reason.trim() || null,
    });
    if (plan.state === "conflict") {
      conflicts(plan);
      return;
    }
    review(plan);
  }
  function conflicts(result, updateId) {
    container.replaceChildren(
      el("h2", "競合を解決してください"),
      el(
        "p",
        "他の変更は保持しています。各項目の採用する値を選び、下書きを保存して再プレビューしてください。",
      ),
    );
    const choices = [];
    for (const c of result.conflicts) {
      const box = el("section", undefined, "conflict-field");
      box.append(el("h3", (c.id || c.key) + " " + c.field));
      for (const [label, value] of [
        ["編集開始時", c.base],
        ["自分の変更", c.ours],
        ["最新main", c.theirs],
      ])
        box.append(el("h4", label), el("p", text(value)));
      const select = el("select");
      select.setAttribute("aria-label", c.key + " " + c.field + "で採用する値");
      select.append(
        new Option("選択してください", ""),
        new Option("自分の変更", "ours"),
        new Option("最新main", "theirs"),
      );
      box.append(select);
      choices.push({ c, select });
      container.append(box);
    }
    container.append(
      action("選択内容を下書きへ保存", () =>
        run(async () => {
          if (choices.some((x) => !x.select.value))
            throw new Error("競合した各項目で採用する値を選択してください。");
          if (updateId) {
            const p = await api(
              "/api/submissions/" + updateId + "/update-preview",
              "POST",
              {
                protocol: 2,
                resolutions: choices.map(({ c, select }) => ({
                  key: c.key,
                  field: c.field,
                  choice: select.value,
                })),
              },
            );
            if (p.state === "conflict") conflicts(p, updateId);
            else review(p, updateId);
            return;
          }
          if (!result.currentRecords)
            throw new Error("PR更新の競合は元の下書きで修正してください。");
          const next = structuredClone(workspace.operations);
          for (const current of result.currentRecords) {
            if (!current.before)
              throw new Error(
                "mainから削除されたレコードです。下書きを除外するか新規登録として見直してください。",
              );
            const op = next.find((o) => o.key === current.key);
            if (!op) continue;
            op.before = current.before;
            op.baseCommit = result.baseCommit;
            op.value = current.value;
            for (const { c, select } of choices.filter(
              (x) => x.c.key === current.key,
            )) {
              const keys = c.field.split("/").slice(1);
              let object = op.value;
              const value = c[select.value];
              if (!keys.length || c.field === "/") {
                op.value = value;
                continue;
              }
              for (const key of keys.slice(0, -1)) object = object[key];
              if (value === undefined) delete object[keys.at(-1)];
              else object[keys.at(-1)] = value;
            }
          }
          workspace.replace(next);
          await workspace.flush();
          draw();
        }),
      ),
      action("変更内容へ戻る", draw),
    );
  }
  function review(p, updateId) {
    onStatus?.("プレビュー済み。まだGitHubへ書き込んでいません。");
    container.replaceChildren(
      el("h2", "変更プレビュー"),
      el("h3", p.title),
      el("p", "最新main: " + p.baseCommit),
      el("pre", p.summary),
      compare(p.records),
    );
    if (updateId && p.preserveMetadata)
      container.append(
        el(
          "p",
          "GitHubで編集されたPRのタイトル・本文は保持します。最新の変更内容はこの差分と監査ファイルで確認できます。",
        ),
      );
    const confirmed = el("input");
    confirmed.type = "checkbox";
    confirmed.id = "submission-confirmed";
    const label = el("label");
    label.append(
      confirmed,
      document.createTextNode("差分と参照影響を確認しました"),
    );
    const submit = action(
      updateId ? "確認した変更でPRを更新" : "確認した変更でPRを作成",
      () =>
        run(async () => {
          if (!confirmed.checked) return;
          submit.disabled = true;
          try {
            const result = await api(
              updateId
                ? "/api/submissions/" + updateId + "/update"
                : "/api/submissions",
              "POST",
              {
                protocol: 2,
                ...(updateId ? {} : { previewId: p.id }),
                confirmationHash: p.confirmationHash,
              },
            );
            await workspace.load();
            onRefresh?.();
            container.replaceChildren(
              el("h2", updateId ? "PRを更新しました" : "PRを作成しました"),
              safeLink("GitHubでPR #" + result.number + "を確認", result.url),
              action("提出済みPRを確認", () => {
                location.hash = "#submitted";
              }),
              action("一覧へ戻る", () => {
                if (onDone) onDone();
                else draw();
              }),
            );
          } finally {
            submit.disabled = false;
          }
        }),
    );
    submit.classList.add("submission-primary");
    submit.disabled = true;
    confirmed.onchange = () => (submit.disabled = !confirmed.checked);
    container.append(
      label,
      submit,
      action("編集に戻る（再プレビューが必要）", () =>
        onBack ? onBack() : draw(),
      ),
    );
  }
  async function list() {
    const data = await api("/api/submissions?cursor=" + listOffset);
    container.replaceChildren(
      el("h2", "提出済みPR"),
      el(
        "p",
        "状態は詳細を開いたときに取得します。60秒キャッシュ・自動ポーリングなし。",
      ),
      action("一覧を更新", () => run(list)),
    );
    for (const r of data.submissions) {
      const row = el("article", undefined, "content-list-row");
      row.append(
        el("strong", (r.result ? "#" + r.result.number + " " : "") + r.title),
        stateIndicator(
          r.createdAt +
            " / " +
            r.count +
            "件 / " +
            (r.status
              ? (statusLabels[r.status.state] || r.status.state) +
                " / " +
                (r.status.ci === "failed"
                  ? "CI失敗"
                  : statusLabels[r.status.ci]) +
                " / " +
                (r.status.mergeable === false
                  ? "競合あり"
                  : r.status.canMerge
                    ? "マージ可能"
                    : "判定待ち")
              : statusLabels[r.state] || r.state),
        ),
        action("PR詳細", () => run(() => detail(r.id))),
      );
      container.append(row);
    }
    if (listOffset > 0)
      container.append(
        action("前の20件", () =>
          run(async () => {
            listOffset -= 20;
            await list();
          }),
        ),
      );
    if (listOffset + 20 < data.total)
      container.append(
        action("次の20件", () =>
          run(async () => {
            listOffset += 20;
            await list();
          }),
        ),
      );
    for (const legacy of data.legacy || []) {
      const row = el("article", undefined, "content-list-row");
      row.append(
        el("strong", "#" + legacy.number + " " + legacy.title),
        el(
          "span",
          (statusLabels[legacy.state] || legacy.state) +
            " / GitHub作成者: " +
            (legacy.creator || "未取得"),
        ),
        action("旧形式PR #" + legacy.number, () =>
          run(() => legacyDetail(legacy.number)),
        ),
      );
      container.append(row);
    }
    if (!data.submissions.length)
      container.append(el("p", "提出履歴はありません。"));
  }
  async function legacyDetail(number) {
    const p = await api("/api/submissions/legacy/" + number);
    container.replaceChildren(
      el("h2", "旧形式のPR詳細"),
      el("h3", p.title),
      stateIndicator(
        (statusLabels[p.state] || p.state) +
          " / " +
          (p.ci === "failed" ? "CI失敗" : statusLabels[p.ci]),
      ),
      safeLink("GitHubでPR #" + number + "を確認", p.url),
      el(
        "p",
        "再適用用の変更バッチがないため、旧形式のPRは読み取り専用です。GitHubの差分を確認してください。",
      ),
    );
    for (const c of p.checks)
      container.append(safeLink(c.name + " / " + c.status, c.url));
    container.append(action("提出済み一覧へ", () => run(list)));
  }
  async function detail(id) {
    const p = await api("/api/submissions/" + id);
    container.replaceChildren(
      el("h2", "PR詳細"),
      el("h3", p.title),
      el("pre", p.summary),
      compare(p.records),
    );
    if (p.result)
      container.append(
        safeLink("GitHubでPR #" + p.result.number + "を確認", p.result.url),
      );
    if (p.status) {
      const s = p.status;
      if (s.ciError)
        container.append(
          el(
            "p",
            "CI状態を取得できませんでした。権限・利用上限を確認して再取得してください。",
          ),
        );
      container.append(
        el(
          "p",
          "状態確認: " +
            new Intl.DateTimeFormat("ja-JP", {
              timeZone: "Asia/Tokyo",
              dateStyle: "short",
              timeStyle: "short",
            }).format(s.fetchedAt) +
            " JST",
        ),
      );
      container.append(
        stateIndicator(
          (statusLabels[s.state] || s.state) +
            " / " +
            (s.ci === "failed" ? "CI失敗" : statusLabels[s.ci]) +
            " / " +
            (s.mergeable === false
              ? "競合あり"
              : s.mergeable === null
                ? "GitHub判定待ち"
                : s.canMerge
                  ? "マージ可能"
                  : !s.requiredKnown
                    ? "必要チェックの確認が必要"
                    : "GitHubの条件待ち"),
        ),
      );
      for (const check of s.checks)
        container.append(
          safeLink(check.name + " / " + check.status, check.url),
        );
      if (s.state === "open")
        container.append(
          action("最新mainに更新する差分を確認", () =>
            run(async () => {
              const update = await api(
                "/api/submissions/" + id + "/update-preview",
                "POST",
                { protocol: 2 },
              );
              if (update.state === "conflict") conflicts(update, id);
              else review(update, id);
            }),
          ),
        );
    } else
      container.append(
        el("p", statusLabels[p.state] || p.state),
        action("PR作成を再試行", () =>
          run(async () => {
            const result = await api("/api/submissions", "POST", {
              protocol: 2,
              previewId: id,
              confirmationHash: p.confirmationHash,
            });
            await workspace.load();
            await detail(id);
          }),
        ),
      );
    container.append(
      action("状態を更新", () =>
        run(async () => {
          await api("/api/submissions/" + id + "?refresh=1");
          await detail(id);
        }),
      ),
      action("提出済み一覧へ", () => run(list)),
    );
  }
  if (autoPreview) {
    container.replaceChildren(
      el("h2", "変更を検証中…"),
      el("p", "最新main・参照・公開状態を確認しています。"),
    );
    run(preview);
  } else draw();
  return controller;
}
