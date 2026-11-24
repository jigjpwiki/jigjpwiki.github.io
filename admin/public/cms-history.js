function node(tag, value = "") {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

const errors = {
  cms_history_reversal_conflict: "この変更と同じ項目が後から更新されたため、取り消せません。",
  cms_history_existing_draft: "この対象には保存済みの下書きがあります。下書きを確認してください。",
  cms_history_reversal_unavailable: "この種類の変更は履歴から取り消せません。",
  workspace_revision_conflict: "別の画面で下書きが更新されました。再読み込みしてください。",
  main_changed_reload: "公開データが更新されました。履歴を開き直してください。",
  no_changes: "この変更はすでに取り消されています。",
};

export function mountCmsHistory({ api, editable, revision, afterSave }) {
  const section = node("details");
  section.append(node("summary", "編集履歴"));
  const list = node("div");
  list.className = "stack";
  const detail = node("div");
  detail.className = "stack";
  const status = node("p");
  status.setAttribute("role", "status");
  section.append(list, detail, status);

  function button(label, action) {
    const control = node("button", label);
    control.type = "button";
    control.onclick = async () => {
      control.disabled = true;
      status.textContent = "読み込み中";
      try {
        await action();
        if (status.textContent === "読み込み中") status.textContent = "";
      } catch (error) {
        status.textContent = errors[error.message] || "編集履歴を利用できませんでした。";
      } finally { control.disabled = false; }
    };
    return control;
  }

  async function show(batchId) {
    const entry = await api("/api/cms/history?batchId=" + encodeURIComponent(batchId));
    detail.replaceChildren(node("h3", "変更内容"));
    for (const operation of entry.operations) {
      const record = node("section");
      record.className = "stack";
      const { before, after, changedFields } = operation;
      const title = after?.title || after?.displayName || before?.title || before?.displayName || operation.recordId;
      record.append(node("h4", title));
      for (const field of changedFields) {
        const value = (row) => row && Object.hasOwn(row, field) ? JSON.stringify(row[field], null, 2) : "未設定";
        record.append(node("p", field), node("pre", "変更前 " + value(before)), node("pre", "変更後 " + value(after)));
      }
      if (editable && operation.action === "edit" && before && after && before.visibility === after.visibility)
        record.append(button("取り消しを下書きに追加", async () => {
          await api("/api/cms/history", "POST", {
            batchId, operationId: operation.operationId, recordId: operation.recordId,
            sha: entry.sha, revision: revision(),
          });
          await afterSave();
          status.textContent = "取り消しを下書きに追加しました。内容を確認してから公開してください。";
        }));
      detail.append(record);
    }
    detail.querySelector("h3")?.setAttribute("tabindex", "-1");
    detail.querySelector("h3")?.focus();
  }

  async function page(offset) {
    const result = await api("/api/cms/history?offset=" + offset);
    detail.replaceChildren();
    list.replaceChildren();
    if (!result.records.length) list.append(node("p", "このページに表示できる編集履歴はありません。"));
    for (const item of result.records) {
      const date = new Date(item.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
      list.append(button(date + "・" + item.count + "件", () => show(item.batchId)));
    }
    if (offset > 0) list.append(button("先頭に戻る", () => page(0)));
    if (result.next !== null) list.append(button("次の履歴", () => page(result.next)));
  }
  list.append(button("履歴を読み込む", () => page(0)));
  return section;
}
