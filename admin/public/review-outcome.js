import { el, action, safeLink } from "./controls.js";
export function renderOutcome(
  container,
  { number, url, updated = false, onSubmitted, onBack },
) {
  const heading = el("h2", updated ? "PRを更新しました" : "PRを作成しました"),
    message = el(
      "p",
      `PR #${number} の差分とCIをGitHubで確認してください。公開には人間のレビュー・マージが必要です。`,
    ),
    actions = el("div", undefined, "button-group");
  const open = safeLink("GitHubでPRを開く", url);
  open.className = "button primary";
  actions.append(open);
  if (onSubmitted) actions.append(action("提出済みPRを確認", onSubmitted));
  if (onBack) actions.append(action("一覧へ戻る", onBack));
  container.replaceChildren(heading, message, actions);
  heading.tabIndex = -1;
  heading.focus();
}
