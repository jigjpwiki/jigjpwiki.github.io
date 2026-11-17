import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const css = fs.readFileSync(
    new URL("../public/tokens.css", import.meta.url),
    "utf8",
  ),
  themes = [...css.matchAll(/:root\s*\{([^}]+)\}/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/(--[\w-]+):\s*(#[a-f0-9]{3,6})/gi)].map((x) => [
        x[1],
        x[2],
      ]),
    ),
  );
const lum = (hex) => {
  if (hex.length === 4)
    hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((a, b) => b - a);
  return (x + 0.05) / (y + 0.05);
};
test("light/dark shared text and control tokens meet minimum contrast", () => {
  assert.equal(themes.length, 2);
  for (const theme of themes) {
    for (const key of ["--ink", "--muted", "--accent", "--danger"])
      assert(ratio(theme[key], theme["--surface"]) >= 4.5, key);
    assert(ratio(theme["--control-line"], theme["--surface"]) >= 3);
  }
});
test("legacy sheets cannot redefine root token authority and spacing remains on the shared scale", () => {
  for (const f of ["app.css", "workbench.css"])
    assert(
      !/:root\s*\{/.test(
        fs.readFileSync(new URL("../public/" + f, import.meta.url), "utf8"),
      ),
    );
  for (const [n, v] of [
    [1, 4],
    [2, 8],
    [3, 12],
    [4, 16],
    [6, 24],
    [8, 32],
    [12, 48],
  ])
    assert(css.includes(`--space-${n}: ${v}px`));
});
