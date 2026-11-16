(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TalentStreams = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const states = {
    live: "配信中（収集時点）",
    upcoming: "配信予定",
    archive: "アーカイブ・動画",
  };
  function accountId(service, value) {
    if (!["youtube", "twitch"].includes(service)) return null;
    return typeof value === "string" &&
      (service === "youtube" ? /^UC[\w-]{22}$/ : /^[a-z0-9_]{1,25}$/i).test(
        value,
      )
      ? service === "twitch"
        ? value.toLowerCase()
        : value
      : null;
  }
  function identityIndex(people) {
    return people
      .filter((p) => p.visibility !== "draft")
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        accounts: p.accounts
          .filter((a) => accountId(a.service, a.accountId))
          .map((a) => ({
            service: a.service,
            accountId: accountId(a.service, a.accountId),
          })),
      }));
  }
  function owner(row, service, people) {
    const id = accountId(
      service,
      row?.[service === "youtube" ? "youtubeid" : "twitchid"],
    );
    if (!id) return null;
    if (!Array.isArray(people)) return null;
    const matches = people.filter(
      (p) =>
        p &&
        /^tal-\d{6}$/.test(p.id) &&
        Array.isArray(p.accounts) &&
        p.accounts.some(
          (a) =>
            a &&
            a.service === service &&
            accountId(service, a.accountId) === id,
        ),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function normalize(row, service) {
    if (
      !row ||
      !Object.hasOwn(states, row.status) ||
      typeof row.title !== "string" ||
      typeof row.date !== "string" ||
      !Number.isFinite(Date.parse(row.date))
    )
      return null;
    const id = accountId(
      service,
      row[service === "youtube" ? "youtubeid" : "twitchid"],
    );
    if (!id) return null;
    let u;
    try {
      u = new URL(row.url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    let url;
    if (service === "youtube") {
      if (
        !["youtube.com", "www.youtube.com"].includes(u.hostname) ||
        u.pathname !== "/watch" ||
        typeof row.videoId !== "string" ||
        !/^[\w-]{11}$/.test(row.videoId) ||
        u.searchParams.get("v") !== row.videoId
      )
        return null;
      url = `https://www.youtube.com/watch?v=${row.videoId}`;
    } else if (service === "twitch") {
      if (!["twitch.tv", "www.twitch.tv"].includes(u.hostname)) return null;
      if (row.status === "archive") {
        if (
          typeof row.videoId !== "string" ||
          !/^\d+$/.test(row.videoId) ||
          u.pathname !== `/videos/${row.videoId}`
        )
          return null;
        url = `https://www.twitch.tv/videos/${row.videoId}`;
      } else {
        if (u.pathname.toLowerCase().replace(/\/$/, "") !== "/" + id)
          return null;
        url = `https://www.twitch.tv/${id}`;
      }
    } else return null;
    let thumbnail = null;
    try {
      const image = new URL(row.thumbnail);
      if (
        image.protocol === "https:" &&
        !image.username &&
        !image.password &&
        !image.port
      )
        thumbnail = image.href;
    } catch {}
    return {
      service,
      title: row.title,
      date: row.date,
      status: row.status,
      url,
      thumbnail,
    };
  }
  function select(talent, youtube, twitch, people = [talent]) {
    const counts = { live: 0, upcoming: 0, archive: 0 };
    const seen = new Set(),
      rows = [];
    for (const [service, input] of [
      ["youtube", youtube],
      ["twitch", twitch],
    ])
      for (const row of Array.isArray(input) ? input : []) {
        if (owner(row, service, people)?.id !== talent.id) continue;
        const item = normalize(row, service);
        if (!item || seen.has(item.url)) continue;
        seen.add(item.url);
        rows.push(item);
      }
    const priority = { live: 0, upcoming: 1, archive: 2 };
    return rows
      .sort(
        (a, b) =>
          priority[a.status] - priority[b.status] ||
          (a.status === "upcoming"
            ? Date.parse(a.date) - Date.parse(b.date)
            : Date.parse(b.date) - Date.parse(a.date)),
      )
      .filter((row) => ++counts[row.status] <= 6);
  }
  function freshness(value, now = Date.now()) {
    const time = typeof value === "string" ? Date.parse(value) : NaN;
    return !Number.isFinite(time) || time > now + 300000
      ? "unknown"
      : now - time > 3600000
        ? "stale"
        : "recent";
  }
  return {
    identityIndex,
    accountId,
    owner,
    normalize,
    select,
    freshness,
    states,
  };
});
