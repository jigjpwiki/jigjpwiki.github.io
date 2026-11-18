export const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
export const action = (text, fn, cls) => {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
};
export const safeLink = (text, url) => {
  const n = el("a", text);
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && !u.username && !u.password) {
      n.href = u.href;
      n.target = "_blank";
      n.rel = "noreferrer";
    }
  } catch {}
  return n;
};
export function portrait(url, name = "") {
  const box = el("div", undefined, "portrait"),
    fallback = el("span", [...name][0] || "画像なし");
  box.append(fallback);
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && !u.username && !u.password) {
      const img = el("img");
      img.alt = name
        ? `${name}のプロフィール画像`
        : "プロフィール画像のプレビュー";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = u.href;
      img.onload = () => box.classList.add("loaded");
      img.onerror = () => {
        img.remove();
        fallback.textContent = "画像を表示できません";
        box.classList.remove("loaded");
      };
      box.append(img);
    }
  } catch {}
  return box;
}
export function labelled(text, input, path, registry) {
  const box = el("div", undefined, "form-field"),
    label = el("label", text),
    id = "edit-" + path.replace(/[^a-z0-9]/gi, "-");
  input.id = id;
  label.htmlFor = id;
  input.setAttribute("aria-label", text);
  const error = el("p", undefined, "field-error");
  error.id = id + "-error";
  error.hidden = true;
  input.setAttribute("aria-describedby", error.id);
  box.append(label, input, error);
  registry?.set(path, { input, error, box });
  return box;
}
export function textField(label, value, change, path, registry, type = "text") {
  const input = el("input");
  input.type = type;
  input.value = value ?? "";
  input.oninput = () => change(input.value);
  return labelled(label, input, path, registry);
}
export function choice(label, value, options, change, path, registry) {
  const select = el("select");
  for (const [key, name] of options) select.append(new Option(name, key));
  select.value = value ?? "";
  select.onchange = () => change(select.value);
  return labelled(label, select, path, registry);
}
export function namePicker(
  label,
  ids,
  rows,
  change,
  { multiple = false, path, registry } = {},
) {
  const box = el("div", undefined, "name-picker"),
    search = el("input");
  search.type = "search";
  search.placeholder = "名前で候補を絞り込み";
  search.setAttribute("aria-label", label + "を検索");
  const select = el("select");
  select.multiple = multiple;
  select.size = multiple ? 5 : 1;
  const selected = new Set(multiple ? ids : [ids].filter(Boolean));
  const render = () => {
    select.replaceChildren();
    if (!multiple) select.append(new Option("未登録・不明", ""));
    const query = search.value.normalize("NFKC").toLowerCase();
    for (const row of rows.filter(
      (r) =>
        selected.has(r.id) ||
        (r.displayName || r.name)
          .normalize("NFKC")
          .toLowerCase()
          .includes(query),
    )) {
      const option = new Option(row.displayName || row.name, row.id);
      option.selected = selected.has(row.id);
      select.append(option);
    }
    for (const id of selected)
      if (!rows.some((r) => r.id === id))
        select.append(new Option("未確認の参照：" + id, id, true, true));
  };
  select.onchange = () => {
    selected.clear();
    for (const o of select.selectedOptions) if (o.value) selected.add(o.value);
    change(multiple ? [...selected] : [...selected][0] || null);
  };
  search.oninput = render;
  render();
  box.append(search, labelled(label, select, path, registry));
  return box;
}
