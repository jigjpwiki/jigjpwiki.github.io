(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.TalentDirectory = api;
    api.mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const normalize = (s) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96))
      .replace(/\s/g, "");
  const ended = p => ["ended","retired"].includes(p.activity);
  const independent = p => p.unaffiliated === true && !ended(p);
  function matches(p, f = {}) {
    return (
      (!f.q ||
        [p.name, ...p.aliases].some((s) =>
          normalize(s).includes(normalize(f.q)),
        )) &&
      (!f.organization ||
        (f.relation === "current"
          ? p.current
          : f.relation === "former"
            ? p.former
            : [...p.current, ...p.former]
        ).includes(f.organization)) &&
      (!f.group || p.groups.includes(f.group)) &&
      (!f.relation ||
        (f.relation === "unknown"
          ? !p.current.length && !p.former.length && !p.unaffiliated
          : f.relation === "unaffiliated"
            ? independent(p)
            : p[f.relation].length > 0))
    );
  }
  function representative(p, organizations) {
    return (
      organizations.find((o) => p.current.includes(o.id))?.id ||
      (ended(p) ? (p.former.length ? "former" : "ended") : independent(p) ? "unaffiliated" : p.former.length ? "former" : "unknown")
    );
  }
  function arrange(people, organizations, sort = "agency") {
    const rows = people
      .map((p, i) => ({ p, i: p.order ?? i }))
      .sort((a, b) => a.i - b.i);
    if (sort !== "agency") {
      const collator = new Intl.Collator("ja", {
        numeric: true,
        sensitivity: "base",
      });
      if (sort === "name")
        rows.sort((a, b) => collator.compare(a.p.name, b.p.name) || a.i - b.i);
      return [
        {
          id: "all",
          name: sort === "name" ? "名前順" : "登録順",
          people: rows.map((r) => r.p),
        },
      ];
    }
    return [
      ...organizations.map((o) => ({ id: o.id, name: o.name })),
      { id: "unaffiliated", name: "無所属" },
      { id: "former", name: "旧所属のタレント" },
      { id: "ended", name: "活動終了・引退" },
      { id: "unknown", name: "所属不明" },
    ]
      .map((section) => ({
        ...section,
        people: rows
          .map((r) => r.p)
          .filter((p) => representative(p, organizations) === section.id),
      }))
      .filter((s) => s.people.length);
  }
  function mount() {
    const form = document.getElementById("talent-filters");
    if (
      !form ||
      !document.getElementById("talent-results") ||
      !document.getElementById("talent-sort")
    )
      return;
    const cards = [...document.querySelectorAll("[data-person]")].map((el) => ({
        el,
        p: JSON.parse(el.dataset.person),
      })),
      config = JSON.parse(
        document.getElementById("directory-data").textContent,
      ),
      result = document.getElementById("talent-results");
    const fields = {
      q: document.getElementById("talent-search"),
      organization: document.getElementById("talent-organization"),
      group: document.getElementById("talent-group"),
      relation: document.getElementById("talent-relation"),
      sort: document.getElementById("talent-sort"),
    };
    for (const [key, rows] of [
      ["organization", config.organizations],
      ["group", config.groups],
    ])
      for (const row of rows) fields[key].add(new Option(row.name, row.id));
    const labels = new Map(
      Object.values(fields)
        .filter((el) => el.options)
        .flatMap((el) =>
          [...el.options].map((o) => [el.id + o.value, o.textContent]),
        ),
    );
    function readUrl() {
      const params = new URLSearchParams(location.search);
      for (const [key, input] of Object.entries(fields)) {
        const value = params.get(key) || (key === "sort" ? "agency" : "");
        input.value =
          input.options && ![...input.options].some((o) => o.value === value)
            ? key === "sort"
              ? "agency"
              : ""
            : value;
      }
    }
    function draw(save = false, replace = false) {
      const f = Object.fromEntries(
        Object.entries(fields).map(([key, input]) => [key, input.value]),
      );
      let count = 0;
      for (const card of cards) {
        card.el.hidden = !matches(card.p, f);
        if (!card.el.hidden) count++;
      }
      result.replaceChildren();
      for (const group of arrange(
        cards.map((c) => c.p),
        config.organizations,
        f.sort,
      )) {
        const section = document.createElement("section"),
          heading = document.createElement("h2"),
          list = document.createElement("ul");
        section.className = "agency-section";
        section.dataset.directorySection = group.id;
        list.className = "talent-grid";
        let n = 0;
        for (const person of group.people) {
          const card = cards.find((c) => c.p.id === person.id);
          list.append(card.el);
          if (!card.el.hidden) n++;
        }
        heading.textContent = group.name;
        const number = document.createElement("span");
        number.textContent = `${n}名`;
        heading.append(number);
        section.append(heading, list);
        section.hidden = n === 0;
        result.append(section);
      }
      for (const key of ["organization", "group", "relation"])
        for (const option of fields[key].options) {
          const n = cards.filter(({ p }) =>
            matches(p, { ...f, [key]: option.value }),
          ).length;
          option.textContent = `${labels.get(fields[key].id + option.value)} (${n})`;
        }
      document.getElementById("talent-count").textContent =
        `${count}名 ／ 全${cards.length}名`;
      document.getElementById("talent-empty").hidden = count !== 0;
      if (save) {
        const url = new URL(location.href);
        for (const [key, value] of Object.entries(f)) {
          if (value && (key !== "sort" || value !== "agency"))
            url.searchParams.set(key, value);
          else url.searchParams.delete(key);
        }
        if (url.href !== location.href)
          history[replace ? "replaceState" : "pushState"](null, "", url);
      }
    }
    let composing = false,
      searchEditing = false;
    const change = (e) => {
      if (composing) return;
      const search = e.target === fields.q;
      draw(true, search && searchEditing);
      searchEditing = search;
    };
    form.addEventListener("compositionstart", () => (composing = true));
    form.addEventListener("compositionend", (e) => {
      composing = false;
      change(e);
    });
    fields.q.addEventListener("blur", () => (searchEditing = false));
    form.onsubmit = (e) => e.preventDefault();
    form.oninput = change;
    form.onchange = change;
    form.onreset = (e) => {
      e.preventDefault();
      searchEditing = false;
      for (const [key, input] of Object.entries(fields))
        input.value = key === "sort" ? "agency" : "";
      draw(true);
    };
    window.addEventListener("popstate", () => {
      searchEditing = false;
      readUrl();
      draw();
    });
    readUrl();
    form.hidden = false;
    draw();
  }
  return { normalize, matches, representative, arrange, mount };
});
