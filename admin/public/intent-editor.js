import { el, action } from "./controls.js";
import {
  intentLabels,
  planIntent,
  projectedModels,
  referencesTo,
} from "./talent-actions.js";
export function mountIntentEditor({
  container,
  models,
  getOperations,
  baseCommit,
  ids,
  onApply,
  onBack,
}) {
  const context = projectedModels(models, getOperations());
  const entityNames = {
    talent: "VTuber",
    group: "グループ",
    anniversary: "記念日",
    event: "イベント",
    song: "楽曲",
    musicVideo: "歌動画",
    video: "動画",
    karaoke: "歌枠",
    performance: "歌唱記録",
    campaign: "キャンペーン",
    product: "商品",
    offer: "販売情報",
  };
  const states = {
    unknown: "不明",
    active: "活動中",
    hiatus: "休止",
    retired: "引退",
    ended: "活動終了",
    affiliated: "所属中",
    unaffiliated: "無所属",
  };
  const publication = (r) =>
    r.visibility === "draft"
      ? r.historyNamePublic
        ? "プロフィール非表示・名前は公開履歴に掲載"
        : "非公開"
      : "公開";
  const describe = (c) => {
    const lines = [];
    for (const [key, label] of [
      ["activityStatus", "活動状態"],
      ["agencyStatus", "所属状態"],
    ])
      if (c.before?.[key]?.value !== c.after[key]?.value)
        lines.push(
          label +
            "：" +
            (states[c.before?.[key]?.value] || "未登録") +
            " → " +
            (states[c.after[key]?.value] || "未登録"),
        );
    if (
      JSON.stringify(c.before?.affiliations) !==
      JSON.stringify(c.after.affiliations)
    ) {
      const affiliations = (r) =>
        (r.affiliations || [])
          .map(
            (a) =>
              (context.talents.organizations.find(
                (o) => o.id === a.organizationId,
              )?.name || "所属不明") +
              "（" +
              (a.status === "former" ? "旧所属" : "所属中") +
              "）",
          )
          .join("・") || "未登録";
      lines.push(
        "所属履歴：" + affiliations(c.before) + " → " + affiliations(c.after),
      );
    }
    if (publication(c.before) !== publication(c.after))
      lines.push(
        "掲載：" + publication(c.before) + " → " + publication(c.after),
      );
    if (c.entity === "group")
      lines.push(
        "現メンバー：" +
          c.before.talentIds.length +
          "名 → " +
          c.after.talentIds.length +
          "名（過去の名簿は保持）",
      );
    return lines.join(" / ");
  };
  const selected = projectedModels(
    models,
    getOperations(),
  ).talents.talents.filter((t) => ids.includes(t.id));
  container.replaceChildren();
  container.classList.add("stack");
  container.append(
    el("h2", "状態・掲載を変更"),
    el("p", selected.map((t) => t.displayName).join("・")),
  );
  const form = el("div", undefined, "page-section stack"),
    select = el("select"),
    date = el("input"),
    org = el("select"),
    target = el("select"),
    group = el("select");
  select.setAttribute("aria-label", "やりたい作業");
  select.append(new Option("作業を選択してください", ""));
  for (const [k, v] of Object.entries(intentLabels))
    select.append(new Option(v, k));
  date.type = "date";
  date.setAttribute("aria-label", "確認した日付（不明なら空欄）");
  const field = (label, input) => {
    input.setAttribute("aria-label", label);
    const l = el("label", undefined, "field-stack");
    l.append(el("span", label), input);
    return l;
  };
  org.append(new Option("事務所を選択", ""));
  target.append(new Option("新しい事務所を選択", ""));
  group.append(new Option("グループを選択", ""));
  context.talents.organizations.forEach((o) => {
    org.append(new Option(o.name, o.id));
    target.append(new Option(o.name, o.id));
  });
  context.catalog.groups.forEach((g) => group.append(new Option(g.name, g.id)));
  const of = field("対象の事務所", org),
    tf = field("移籍先", target),
    gf = field("対象グループ", group),
    df = field("確認した日付（不明なら空欄）", date);
  const help = el("p"),
    error = el("div", undefined, "validation-message"),
    preview = el("section", undefined, "page-section stack");
  error.setAttribute("role", "alert");
  const draw = () => {
    of.hidden = !["join", "leave", "transfer"].includes(select.value);
    tf.hidden = select.value !== "transfer";
    gf.hidden = !["groupJoin", "groupLeave"].includes(select.value);
    df.hidden = !["join", "leave", "transfer"].includes(select.value);
    help.textContent =
      select.value === "hideHistory"
        ? "名前と過去の出演・商品・配信リンクは公開したまま、プロフィール・画像・SNS欄・一覧掲載を停止します。完全非公開ではありません。"
        : select.value === "hidePrivate"
          ? "関連する公開レコードを削除せず、公開サイトから非表示にします。他の出演者を含む情報も表示されなくなる場合があります。公開GitHubの原本・履歴や外部サイトは削除しません。自由文・既存キャッシュも確認してください。"
          : "活動・所属・公開は独立しています。指定した目的以外の状態や過去の履歴は変更しません。";
    preview.replaceChildren();
    container.querySelector(":scope > button")?.classList.add("primary");
    error.textContent = "";
  };
  form.append(field("やりたい作業", select), help, of, tf, gf, df);
  container.append(form, error);
  const impact = el("details"),
    summary = el("summary", "現在の関連情報を確認");
  impact.append(summary);
  for (const t of selected) {
    const list = el("ul");
    for (const r of referencesTo(
      projectedModels(models, getOperations()),
      t.id,
    ))
      list.append(
        el(
          "li",
          `${entityNames[r.entity] || r.entity} / ${r.title}（${r.id}）${r.public ? " 公開" : " 非公開"}`,
        ),
      );
    impact.append(el("h3", t.displayName), list);
  }
  container.append(impact);
  container.append(
    action(
      "変更案を確認",
      () => {
        try {
          const baseline = JSON.stringify(getOperations()),
            plan = planIntent(
              models,
              getOperations(),
              ids,
              select.value,
              {
                organizationId: org.value,
                toOrganizationId: target.value,
                groupId: group.value,
                date: date.value || null,
              },
              baseCommit,
            );
          container
            .querySelectorAll("button.primary")
            .forEach((b) => b.classList.remove("primary"));
          preview.replaceChildren(el("h3", `${plan.changes.length}件の変更案`));
          const list = el("ul");
          plan.changes.forEach((c) =>
            list.append(
              el(
                "li",
                `${c.name}（${c.id}） / ${entityNames[c.entity] || c.entity}：${describe(c)}`,
              ),
            ),
          );
          preview.append(list);
          if (plan.impact.length) {
            preview.append(el("h3", "公開への影響"));
            const refs = el("ul");
            plan.impact.forEach((r) =>
              refs.append(
                el(
                  "li",
                  `${r.title}（${r.id}） / ${entityNames[r.entity] || r.entity}`,
                ),
              ),
            );
            preview.append(refs);
          }
          const checked = el("input");
          checked.type = "checkbox";
          checked.setAttribute(
            "aria-label",
            "対象・履歴・公開への影響を確認しました",
          );
          preview.append(
            field("対象・履歴・公開への影響を確認しました", checked),
          );
          const apply = action(
            "確認した変更を下書きへ",
            () => {
              if (!checked.checked) {
                error.textContent = "影響を確認してチェックしてください。";
                checked.focus();
                return;
              }
              if (baseline !== JSON.stringify(getOperations())) {
                error.textContent =
                  "下書きが変わりました。変更案を再確認してください。";
                return;
              }
              onApply(plan.operations);
            },
            "primary",
          );
          preview.append(apply);
          error.textContent = "";
          preview.scrollIntoView({ block: "nearest" });
          preview.querySelector("h3").tabIndex = -1;
          preview.querySelector("h3").focus();
        } catch (e) {
          error.textContent = e.message;
        }
      },
      "primary",
    ),
    preview,
    action("一覧へ戻る", onBack, "text-action"),
  );
  [select, org, target, group, date].forEach((input) =>
    input.addEventListener("change", draw),
  );
  draw();
}
