"use strict";
// Frozen regression data + current renderer. Never overwrite the live _site build.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  cp = require("node:child_process");
let site;
module.exports = (overrides,files={}) => {
  if (site && !overrides) return site;
  const root = path.resolve(__dirname, "../.."),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "jigdule-browser-rules-"));
  for (const dir of [
    "scripts",
    "lib",
    "schemas",
    "pages",
    "assets",
    "data",
    "privacy-policy",
    "terms",
  ])
    fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  for (const name of fs.readdirSync(root))
    if (fs.statSync(path.join(root, name)).isFile() && !name.startsWith("."))
      fs.copyFileSync(path.join(root, name), path.join(temp, name));
  for (const [name, value] of Object.entries(
    {...require("./admin-vnext-baseline.json"),...overrides},
  )) {
    const dest =
      name === "admin-ledger"
        ? "ops/admin/ledger.json"
        : "data/" + name + ".json";
    fs.mkdirSync(path.dirname(path.join(temp, dest)), { recursive: true });
    fs.writeFileSync(path.join(temp, dest), JSON.stringify(value));
  }
  for(const [name,data]of Object.entries(files)){if(!name.startsWith('assets/')||name.split('/').includes('..'))throw Error('fixture asset path');fs.mkdirSync(path.dirname(path.join(temp,name)),{recursive:true});fs.writeFileSync(path.join(temp,name),data);}
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(temp, "node_modules"),
    "dir",
  );
  cp.execFileSync(
    process.execPath,
    [path.join(temp, "scripts/build-site.js")],
    { stdio: "pipe" },
  );
  const output = path.join(temp, "_site");
  if(!overrides)site=output;
  process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
  return output;
};
