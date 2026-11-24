const text = (tag, value) => {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
};

export async function renderDraftConflicts({ container, api, draftId, afterSave }) {
  const result = await api("/api/cms/draft/conflicts?draftId=" + encodeURIComponent(draftId));
  const form = text("form", "");
  form.className = "stack";
  form.append(text("p", "変更が重なった項目ごとに、保存する値を選んでください。重なっていない変更は自動で統合されます。"));
  const choices = result.conflicts.map((conflict, index) => {
    const group = text("fieldset", "");
    group.append(text("legend", conflict.id + " " + conflict.field.replaceAll("/", " › ").trim()));
    const descriptions = [["編集前", "base"], ["自分の変更", "ours"], ["最新データ", "theirs"]];
    const select = text("select", "");
    select.required = true;
    select.setAttribute("aria-label", conflict.id + " " + conflict.field + "に適用する値");
    for (const [label, key] of descriptions) {
      const value = conflict[key];
      group.append(text("p", label), text("pre", value === undefined ? "未設定" : JSON.stringify(value, null, 2)));
    }
    for (const [label, value] of [["選択してください", ""], ["自分の変更", "ours"], ["最新データ", "theirs"]]) {
      const option = text("option", label);
      option.value = value;
      select.append(option);
    }
    select.name = "choice-" + index;
    group.append(select);
    form.append(group);
    return select;
  });
  if (!choices.length) form.append(text("p", "同じ項目への変更はありません。最新データと統合して保存できます。"));
  const submit = text("button", "選択を反映して下書きを保存");
  const status = text("p", "");
  status.setAttribute("role", "status");
  form.append(submit, status);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await api("/api/cms/draft/conflicts", "PUT", {
        draftId, sha: result.sha, revision: result.revision, choices: choices.map((select) => select.value),
      });
      await afterSave();
    } catch (error) {
      status.textContent = ["main_changed_reload", "workspace_revision_conflict"].includes(error.message)
        ? "最新の情報が更新されました。比較を開き直してください。"
        : "選択内容を保存できませんでした。下書きは保持されています。";
    } finally { submit.disabled = false; }
  };
  container.replaceChildren(form);
  (choices[0] || submit).focus();
}
