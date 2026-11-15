const esbuild = require("esbuild"),
  fs = require("node:fs");
fs.mkdirSync("build", { recursive: true });
esbuild.buildSync({
  entryPoints: ["src/worker.mjs"],
  outfile: "build/worker.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
console.log("Admin worker built locally; no deploy");
