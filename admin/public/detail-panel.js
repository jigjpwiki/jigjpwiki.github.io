import { el, action } from "./controls.js";
export function detailPanel(host, { title, onClose = () => true } = {}) {
  const previous = document.activeElement,
    panel = el("aside", undefined, "detail-panel"),
    bar = el("div", undefined, "panel-heading"),
    heading = el("h2", title),
    content = el("div", undefined, "panel-content");
  heading.tabIndex = -1;
  heading.id = "panel-" + crypto.randomUUID();
  panel.setAttribute("aria-labelledby", heading.id);
  let full = false;
  const close = () => {
    const pending = panel.querySelector(
      "[data-uncommitted-cell] input,[data-uncommitted-cell] select",
    );
    if (pending) {
      pending.focus();
      return;
    }
    if (onClose() === false) return;
    panel.remove();
    host.classList.remove("with-detail", "detail-full");
    if (previous?.isConnected) previous.focus();
    else
      [...host.querySelectorAll("button")]
        .find(
          (b) =>
            b.getAttribute("aria-label") ===
            previous?.getAttribute("aria-label"),
        )
        ?.focus();
  };
  bar.append(
    heading,
    action("全画面編集", () => {
      full = !full;
      host.classList.toggle("detail-full", full);
    }),
    action("パネルを閉じる", close),
  );
  panel.append(bar, content);
  host.append(panel);
  host.classList.add("with-detail");
  panel.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      !e.defaultPrevented &&
      e.target.tagName !== "SELECT"
    ) {
      e.preventDefault();
      close();
    }
  });
  heading.focus();
  return { content, close, panel };
}
