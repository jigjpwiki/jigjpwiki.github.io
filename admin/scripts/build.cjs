const esbuild = require("esbuild"),
  fs = require("node:fs"),
  path = require("node:path"),
  Ajv = require("ajv"),
  standalone = require("ajv/dist/standalone").default,
  { _ } = require("ajv/dist/compile/codegen");
fs.mkdirSync("build", { recursive: true });
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, formats: _`require('../scripts/formats.cjs')` },
});
for (const [k, v] of Object.entries(require("./formats.cjs")))
  ajv.addFormat(k, v);
const names = [
    "feature-common",
    "talents",
    "catalog",
    "anniversaries",
    "goods",
    "media",
    "events",
    "music",
    "karaoke",
  ],
  exportsMap = {},
  map = {};
for (const name of names) {
  const schema = require("../../schemas/" + name + ".schema.json"),
    id = schema.$id || "admin:" + name;
  ajv.addSchema(schema, id);
  if (name !== "feature-common") {
    exportsMap[name.replace(/-/g, "_")] = id;
    map[JSON.stringify(schema)] = name.replace(/-/g, "_");
  }
}
fs.writeFileSync("build/validators.cjs", standalone(ajv, exportsMap));
fs.writeFileSync("build/schema-map.json", JSON.stringify(map));
const images = [];
function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const file = path.join(p, e.name);
    if (e.isDirectory()) walk(file);
    else images.push("/" + file.replace(/^\.\.\//, ""));
  }
}
walk("../assets");
fs.writeFileSync("build/images.json", JSON.stringify(images));
esbuild.buildSync({
  entryPoints: ["src/worker.mjs"],
  outfile: "build/worker.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  alias: {
    "ajv/dist/runtime/ucs2length": require.resolve(
      "ajv/dist/runtime/ucs2length",
    ),
    ajv: path.resolve("scripts/ajv-adapter.cjs"),
    "node:fs": path.resolve("scripts/fs-adapter.cjs"),
    "node:path": path.resolve("scripts/path-adapter.cjs"),
  },
});
console.log(
  "Admin worker built with static schemas; no eval/filesystem/subprocess at runtime",
);
