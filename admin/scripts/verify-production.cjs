"use strict";
// Offline comparison only. No Cloudflare calls, deployment or secret values.
const fs = require("node:fs");
function verify(config, version, settings) {
  const requireValue = (ok, message) => {
    if (!ok) throw Error(message);
  };
  requireValue(config.name === "jigwiki-admin", "Unexpected Worker name");
  requireValue(
    Object.keys(config).every((k) =>
      [
        "name",
        "main",
        "keep_vars",
        "vars",
        "account_id",
        "compatibility_date",
        "compatibility_flags",
        "workers_dev",
        "preview_urls",
        "assets",
        "durable_objects",
        "migrations",
      ].includes(k),
    ),
    "Unknown production config field",
  );
  requireValue(
    typeof settings.accountId === "string" &&
      settings.accountId !== "" &&
      config.account_id === settings.accountId,
    "Account identity must be independently confirmed",
  );
  requireValue(
    Object.keys(config.assets || {}).every((k) =>
      ["directory", "binding", "run_worker_first"].includes(k),
    ),
    "Unknown asset configuration",
  );
  requireValue(
    (config.migrations || []).every((m) =>
      Object.keys(m).every((k) => ["tag", "new_sqlite_classes"].includes(k)),
    ),
    "Unknown migration operation",
  );

  requireValue(
    typeof version.id === "string" && version.resources,
    "Version metadata is required",
  );
  const runtime = version.resources.script_runtime || {},
    bindings = version.resources.bindings || [];
  requireValue(
    config.keep_vars === true,
    "keep_vars must be explicitly enabled",
  );
  const vars = Object.fromEntries(
    bindings
      .filter((b) => b.type === "plain_text")
      .map((b) => [b.name, b.text]),
  );
  const proposed = config.vars || {};
  const additions = settings.approvedVnext6Vars || {};
  const allowedAdditions = new Set([
    "GOOGLE_AUTH_ENABLED", "GOOGLE_CLIENT_ID", "GOOGLE_ADMIN_ORIGIN",
    "CMS_PUBLISH_ENABLED", "CMS_GITHUB_APP_ID", "CMS_GITHUB_INSTALLATION_ID",
  ]);
  requireValue(Object.entries(additions).every(([name, value]) =>
    allowedAdditions.has(name) && !Object.hasOwn(vars, name) &&
    typeof value === "string" && value.length > 0),
    "Only explicitly approved new vNext 6 vars may be added");
  requireValue(
    JSON.stringify(Object.entries(proposed).sort()) ===
      JSON.stringify(Object.entries({ ...vars, ...additions }).sort()),
    "Existing plain vars must match the active version and additions must be approved",
  );
  const requiredSecrets = ["GITHUB_CLIENT_SECRET", "SESSION_KEY"];
  if (proposed.GOOGLE_AUTH_ENABLED === "true") {
    requireValue(Boolean(proposed.GOOGLE_CLIENT_ID) &&
      /^https:\/\/[a-z0-9.-]+$/i.test(proposed.GOOGLE_ADMIN_ORIGIN || ""),
      "Google authentication requires a client ID and HTTPS origin");
    requiredSecrets.push("GOOGLE_CLIENT_SECRET");
  }
  if (proposed.CMS_PUBLISH_ENABLED === "true") {
    requireValue(proposed.GOOGLE_AUTH_ENABLED === "true" &&
      /^\d+$/.test(proposed.CMS_GITHUB_APP_ID || "") &&
      /^\d+$/.test(proposed.CMS_GITHUB_INSTALLATION_ID || ""),
      "Publishing requires Google authentication and numeric App identifiers");
    requiredSecrets.push("CMS_GITHUB_APP_KEY");
  }
  for (const name of ["ADMIN_ENABLED", "GITHUB_CLIENT_ID", "ADMIN_USER_IDS"])
    requireValue(
      typeof vars[name] === "string" && vars[name] !== "",
      "Required production var metadata is missing",
    );
  for (const name of requiredSecrets)
    requireValue(
      bindings.some((b) => b.name === name && b.type === "secret_text"),
      "Required secret binding metadata is missing",
    );
  requireValue(
    !config.secrets &&
      !Object.keys(config.vars || {}).some((k) =>
        /secret|session_key|token|app_key|youtube_api_key/i.test(k),
      ),
    "Never put secret values into config",
  );
  requireValue(
    bindings.every(
      (b) =>
        b.type === "plain_text" ||
        b.type === "secret_text" ||
        (b.type === "assets" && b.name === "ASSETS") ||
        (b.type === "durable_object_namespace" && b.name === "ADMIN"),
    ),
    "Unknown production binding: stop and extend the preservation review",
  );
  const admin = bindings.find(
      (b) => b.name === "ADMIN" && b.type === "durable_object_namespace",
    ),
    defs = config.durable_objects?.bindings || [];
  requireValue(
    admin?.namespace_id &&
      admin.class_name === "Admin" &&
      defs.length === 1 &&
      defs[0].name === "ADMIN" &&
      defs[0].class_name === "Admin" &&
      !defs[0].script_name,
    "Durable Object binding differs",
  );
  requireValue(
    settings.adminNamespaceId === admin.namespace_id,
    "Namespace identity must be independently confirmed",
  );
  requireValue(
    config.compatibility_date === runtime.compatibility_date,
    "Compatibility date differs",
  );
  requireValue(
    JSON.stringify(config.compatibility_flags || []) ===
      JSON.stringify(runtime.compatibility_flags || []),
    "Compatibility flags differ",
  );
  requireValue(
    config.migrations?.at(-1)?.tag === runtime.migration_tag,
    "Migration tag differs; do not create/reset a namespace",
  );
  requireValue(
    config.migrations.length === 1 &&
      config.migrations[0].new_sqlite_classes?.length === 1 &&
      config.migrations[0].new_sqlite_classes[0] === "Admin",
    "Unexpected migration",
  );
  requireValue(
    typeof settings.workers_dev === "boolean" &&
      typeof settings.preview_urls === "boolean" &&
      config.workers_dev === settings.workers_dev &&
      config.preview_urls === settings.preview_urls,
    "Worker URL settings must match the current service",
  );
  requireValue(
    config.assets?.binding === "ASSETS" &&
      JSON.stringify(config.assets.run_worker_first) ===
        JSON.stringify(runtime.assets?.raw_run_worker_first),
    "Asset binding/routing differs",
  );
  requireValue(
    config.main === "build/worker.mjs" &&
      config.assets.directory === "./public",
    "Unexpected build/assets path",
  );
  requireValue(
    !config.routes && !config.route && !config.triggers && !config.env,
    "Unexpected routes/triggers/environments",
  );
  return {
    worker: config.name,
    versionId: version.id,
    secretsVerifiedByName: requiredSecrets.length,
    namespacePreserved: true,
  };
}
module.exports = { verify };
if (require.main === module) {
  try {
    if (process.argv.length !== 5)
      throw Error(
        "Usage: node verify-production.cjs <private-config.json> <active-version.json> <private-service-settings.json>",
      );
    const out = verify(
      ...process.argv.slice(2).map((f) =>
        (() => {
          try {
            return JSON.parse(fs.readFileSync(f, "utf8"));
          } catch {
            throw Error("Private metadata/config could not be parsed");
          }
        })(),
      ),
    );
    console.log(
      "Offline production comparison passed; no deployment or settings change. Version: " +
        out.versionId,
    );
  } catch (e) {
    console.error("Production preparation refused: " + e.message);
    process.exitCode = 1;
  }
}
