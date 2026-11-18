"use strict";
// Rule/UI assertions use one frozen snapshot. Current masters are covered by
// current-site.browser.cjs; never mix them into these historical examples.
const path = require("node:path");
const baseline = require("./admin-vnext-baseline.json");
const { publicCatalog, loadCatalog } = require("../../lib/catalog");
module.exports = function contentUxFixture() {
  const root = require("./browser-site.cjs")();
  const master = baseline.talents;
  // Validate all related fixture masters together before starting the HTTP server.
  const catalog = publicCatalog(loadCatalog(master, path.dirname(root)));
  return { root, master, goods: baseline.goods, catalog };
};
