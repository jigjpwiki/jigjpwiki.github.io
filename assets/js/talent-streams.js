"use strict";
(() => {
  const core = window.TalentStreams,
    node = (tag, text, cls) => {
      const e = document.createElement(tag);
      if (text !== undefined) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
  function cards(rows, talent) {
    const grid = node("div", undefined, "talent-stream-grid");
    for (const row of rows) {
      const a = node(
        "a",
        undefined,
        `talent-stream-card service-${row.service}${row.status === "live" ? " is-live" : ""}`,
      );
      a.href = row.url;
      a.dataset.streamState = row.status;
      a.title = row.title;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const media = node("span", undefined, "stream-media");
      const placeholder = () =>
        node("span", "画像なし", "stream-image-fallback");
      if (row.thumbnail) {
        const img = node("img");
        img.src = row.thumbnail;
        img.alt = "";
        img.width = 320;
        img.height = 180;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.onerror = () => img.replaceWith(placeholder());
        media.append(img);
      } else media.append(placeholder());
      const state = node(
        "span",
        { live: "ON AIR", upcoming: "配信予定", archive: "アーカイブ" }[
          row.status
        ],
        "stream-state",
      );
      media.append(state);
      const strip = node("span", undefined, "stream-platform-strip");
      strip.setAttribute("aria-hidden", "true");
      a.append(strip, media);
      const text = node("div", undefined, "stream-card-body"),
        byline = node("div", undefined, "stream-byline"),
        avatar = node(
          "span",
          [...(talent.displayName || "")][0] || "",
          "stream-avatar",
        );
      avatar.setAttribute("aria-hidden", "true");
      if (talent.profileImageUrl) {
        try {
          const u = new URL(talent.profileImageUrl, location.href);
          if (
            !u.username &&
            !u.password &&
            (u.protocol === "https:" || u.origin === location.origin)
          ) {
            const img = node("img");
            img.src = u.href;
            img.alt = "";
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            img.onerror = () => img.remove();
            avatar.append(img);
          }
        } catch {}
      }
      byline.append(
        avatar,
        node("span", talent.displayName || "", "stream-person-name"),
        node(
          "span",
          row.service === "youtube" ? "YouTube" : "Twitch",
          "stream-platform",
        ),
      );
      text.append(byline, node("h4", row.title));
      const time = node(
        "time",
        new Date(row.date).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
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
      status.textContent = "読み込み中…";
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
        const registered = config.talent.accounts.some((a) =>
          core.accountId(a.service, a.accountId),
        );
        if (!registered)
          output.append(node("p", "配信情報は未登録です。", "empty-state"));
        else {
          for (const [state, label, empty] of [
            ["live", "配信中", ""],
            ["upcoming", "配信予定", "配信予定はありません。"],
            ["archive", "最近の配信・アーカイブ", "アーカイブはありません。"],
          ]) {
            const matches = rows.filter((r) => r.status === state);
            if (!matches.length && (state === "live" || feedFailed)) continue;
            const section = node("section");
            section.dataset.streamGroup = state;
            section.append(node("h3", label));
            section.append(
              matches.length
                ? cards(matches, config.talent)
                : node("p", empty, "empty-state"),
            );
            output.append(section);
          }
          if (!rows.length && feedFailed)
            output.append(
              node("p", "保存データをご確認ください。", "empty-state"),
            );
        }
        fallback.open = feedFailed;
      } else {
        fallback.open = true;
        if (!people)
          notices.push(
            "アカウント照合情報を取得できませんでした。保存データを表示しています。",
          );
      }
      const metadataText = profile.querySelector("[data-stream-meta]");
      if (metadataText) metadataText.textContent = notices.join(" ");
      const failures = result
        .slice(0, 2)
        .flatMap((r, i) =>
          r.status === "fulfilled" && Array.isArray(r.value)
            ? []
            : [["YouTube", "Twitch"][i] + "：取得できませんでした。"],
        );
      status.textContent = !people
        ? "配信情報を取得できませんでした。保存データを表示しています。"
        : failures.join(" ") +
          (feedFailed && saved.size
            ? "前回の情報がある場合は残しています。"
            : "");
      if (people && !feedFailed) {
        const freshness = [...saved.values()].map((entry) =>
          core.freshness(entry.stamp),
        );
        if (freshness.includes("stale"))
          status.textContent = "更新が古い可能性があります。";
        else if (freshness.includes("unknown"))
          status.textContent = "更新日時は不明です。";
      }
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
