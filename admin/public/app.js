const $ = (s) => document.querySelector(s);
let me;
export async function api(path, method = "GET", value) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(me ? { "X-CSRF-Token": me.csrf } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "通信に失敗しました");
  return data;
}
export const showStatus = (value) => {
  $("#status").textContent = value;
};
export const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
function screen() {
  if (!me) return;
  const settings = location.hash === "#settings";
  $("#view").replaceChildren(
    node("h2", settings ? "設定" : "管理トップ"),
    node(
      "p",
      settings
        ? "認証と数値ユーザーIDの許可リストはサーバーで管理します。Secretsの表示・変更機能はありません。"
        : "GitHubのJSONが正本です。変更は確認後にPRとして提出し、人間がマージします。",
    ),
  );
}
window.addEventListener("hashchange", screen);
async function start() {
  try {
    me = await api("/api/me");
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#identity").textContent = `${me.login} / 管理者 / ${me.repository}`;
    $("#logout").onclick = async () => {
      await api("/auth/logout", "POST", {});
      location.reload();
    };
    screen();
  } catch (e) {
    showStatus(
      e.message === "login_required"
        ? "GitHubでログインしてください。"
        : e.message,
    );
  }
}
start();
