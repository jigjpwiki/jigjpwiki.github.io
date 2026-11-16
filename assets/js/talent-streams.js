"use strict";
(() => {
  const core = window.TalentStreams,
    node = (tag, text, cls) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
  function cards(rows) {
    const grid = node("div", undefined, "talent-stream-grid");
    for (const row of rows) {
      const a = node("a", undefined, "talent-stream-card");
      a.href = row.url;
      a.rel = "noreferrer";
      if (row.thumbnail) {
        const img = node("img");
        img.src = row.thumbnail;
        img.alt = "";
        img.width = 320;
        img.height = 180;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.onerror = () =>
          img.replaceWith(
            node("span", "画像を表示できません", "stream-image-fallback"),
          );
        a.append(img);
      } else
        a.append(node("span", "サムネイル未登録", "stream-image-fallback"));
      const text = node("div");
      text.append(
        node(
          "span",
          (row.service === "youtube" ? "YouTube" : "Twitch") +
            "・" +
            core.states[row.status],
          "stream-state",
        ),
        node("h4", row.title),
      );
      const time = node(
        "time",
        new Date(row.date).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }) + " JST",
      );
      time.dateTime = row.date;
      text.append(time);
      a.append(text);
      grid.append(a);
    }
    return grid;
  }
  const profile = document.getElementById("talent-streams");
  if (profile) {
    const config = JSON.parse(
        document.getElementById("talent-stream-config").textContent,
      ),
      status = profile.querySelector("[data-stream-status]"),
      output = profile.querySelector("[data-stream-output]"),
      fallback = profile.querySelector("[data-stream-fallback]"),
      refresh = profile.querySelector("button");
    const saved = new Map();
    let busy = false;
    async function update() {
      if (busy) return;
      busy = true;
      refresh.disabled = true;
      status.textContent = "配信情報を読み込んでいます…";
      profile.setAttribute("aria-busy", "true");
      const fetchJson = async (path) => {
        const r = await fetch(path, {
          cache: "no-cache",
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw Error();
        return r.json();
      };
      const result = await Promise.allSettled(
        ["youtube", "twitch", "last_updated", "stream-talents"].map((service) =>
          fetchJson("/data/" + service + ".json"),
        ),
      );
      const metadata =
        result[2].status === "fulfilled" ? result[2].value : null;
      const people =
        result[3].status === "fulfilled" && Array.isArray(result[3].value)
          ? result[3].value
          : null;
      const notices = [];
      const feedFailed = result
        .slice(0, 2)
        .some((r) => r.status !== "fulfilled" || !Array.isArray(r.value));
      result.slice(0, 2).forEach((r, i) => {
        const service = ["youtube", "twitch"][i],
          label = service === "youtube" ? "YouTube" : "Twitch";
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          saved.set(service, { rows: r.value, stamp: metadata?.[service] });
        } else
          notices.push(
            label +
              "の取得に失敗しました。" +
              (saved.has(service)
                ? "前回取得した情報を残しています。"
                : "下の保存データも確認してください。"),
          );
        const entry = saved.get(service);
        if (entry) {
          const freshness = core.freshness(entry.stamp);
          notices.push(
            label +
              "：" +
              (freshness === "unknown"
                ? "更新日時不明"
                : (freshness === "stale"
                    ? "更新から1時間以上経過・状態が古い可能性があります。"
                    : "最終収集：") +
                  new Date(entry.stamp).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  }) +
                  " JST"),
          );
        }
      });
      output.replaceChildren();
      if (saved.size && people) {
        const rows = core.select(
          config.talent,
          saved.get("youtube")?.rows,
          saved.get("twitch")?.rows,
          people,
        );
        for (const [state, label] of [
          ["live", "配信中"],
          ["upcoming", "これからの配信"],
          ["archive", "最近の配信・動画"],
        ]) {
          const matches = rows.filter((r) => r.status === state);
          if (!matches.length) continue;
          const section = node("section");
          section.append(node("h3", label), cards(matches));
          output.append(section);
        }
        if (!rows.length)
          output.append(
            node(
              "p",
              config.talent.accounts.some((a) =>
                core.accountId(a.service, a.accountId),
              )
                ? feedFailed
                  ? "取得できていない配信情報があります。配信の有無を確認できないため、保存データも確認してください。"
                  : "公開フィードに紐づく配信情報はありません。過去の活動がないことを意味しません。"
                : "照合できる公式アカウントが未登録です。",
              "empty-state",
            ),
          );
        fallback.open = feedFailed;
      } else {
        fallback.open = true;
        if (!people)
          notices.push(
            "アカウント照合情報を取得できませんでした。保存データを表示しています。",
          );
      }
      status.textContent = notices.join(" ");
      refresh.disabled = false;
      profile.removeAttribute("aria-busy");
      busy = false;
    }
    refresh.hidden = false;
    refresh.addEventListener("click", update);
    update();
  }
  const list = document.getElementById("videolist");
  if (list) {
    fetch("/data/stream-talents.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(15000),
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((people) => {
        if (!Array.isArray(people)) return;
        const draw = () => {
          for (const card of list.querySelectorAll(".live-wrapper")) {
            if (card.querySelector(".stream-profile-link")) continue;
            const person = core.owner(
              card.dataset,
              card.dataset.platform,
              people,
            );
            if (!person) continue;
            const face = card.querySelector(".face-icon");
            if (!face) return;
            const link = node("a", undefined, "face-icon stream-profile-link");
            link.href = "/talents/" + person.id + "/";
            link.setAttribute(
              "aria-label",
              person.displayName + "のプロフィール",
            );
            link.title = person.displayName + "のプロフィール";
            link.append(...face.childNodes);
            face.replaceWith(link);
          }
        };
        draw();
        new MutationObserver(draw).observe(list, {
          childList: true,
          subtree: true,
        });
      })
      .catch(() => {});
  }
})();
