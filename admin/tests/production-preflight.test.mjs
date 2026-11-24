import test from "node:test";
import assert from "node:assert/strict";
import checker from "../scripts/verify-production.cjs";
const sample = () => {
  const config = {
      name: "jigwiki-admin",
      account_id: "fixture-account",
      main: "build/worker.mjs",
      keep_vars: true,
      vars: {
        ADMIN_ENABLED: "true",
        GITHUB_CLIENT_ID: "fixture-client",
        ADMIN_USER_IDS: "123",
      },
      compatibility_date: "2026-06-18",
      workers_dev: true,
      preview_urls: false,
      assets: {
        directory: "./public",
        binding: "ASSETS",
        run_worker_first: ["/api/*", "/auth/*"],
      },
      durable_objects: { bindings: [{ name: "ADMIN", class_name: "Admin" }] },
      migrations: [{ tag: "v1", new_sqlite_classes: ["Admin"] }],
    },
    version = {
      id: "fixture-version",
      resources: {
        bindings: [
          ...Object.entries(config.vars).map(([name, text]) => ({
            name,
            text,
            type: "plain_text",
          })),
          {
            name: "ADMIN",
            type: "durable_object_namespace",
            class_name: "Admin",
            namespace_id: "fixture-namespace",
          },
          ...["GITHUB_CLIENT_SECRET", "SESSION_KEY"].map((name) => ({
            name,
            type: "secret_text",
          })),
        ],
        script_runtime: {
          compatibility_date: config.compatibility_date,
          migration_tag: "v1",
          assets: { raw_run_worker_first: config.assets.run_worker_first },
        },
      },
    },
    settings = {
      accountId: "fixture-account",
      adminNamespaceId: "fixture-namespace",
      workers_dev: true,
      preview_urls: false,
    };
  return { config, version, settings };
};
test("offline deployment preflight preserves actual vars, secret names, DO and URLs without exposing values", () => {
  const { config, version, settings } = sample();
  assert.equal(
    checker.verify(config, version, settings).namespacePreserved,
    true,
  );
  for (const mutate of [
    (c) => (c.vars.ADMIN_ENABLED = "false"),
    (c) => (c.vars.ADMIN_USER_IDS = ""),
    (c) => (c.keep_vars = false),
    (c) => c.migrations.push({ tag: "v2" }),
    (c) => (c.durable_objects.bindings[0].class_name = "Other"),
    (c) => (c.vars.SESSION_KEY = "NEVER-PRINT-THIS"),
    (c) => (c.workers_dev = false),
  ]) {
    const x = structuredClone(config);
    mutate(x);
    assert.throws(
      () => checker.verify(x, version, settings),
      (e) => !e.message.includes("NEVER-PRINT-THIS"),
    );
  }
  assert.throws(() =>
    checker.verify(config, version, { ...settings, adminNamespaceId: "other" }),
  );
});

test("vNext 6 requires independently approved vars and existing secret metadata", () => {
  const { config, version, settings } = sample();
  const additions = {
    GOOGLE_AUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "fixture-client",
    GOOGLE_ADMIN_ORIGIN: "https://admin.example.test", CMS_PUBLISH_ENABLED: "true",
    CMS_GITHUB_APP_ID: "12", CMS_GITHUB_INSTALLATION_ID: "34",
  };
  Object.assign(config.vars, additions);
  assert.throws(() => checker.verify(config, version, settings), /additions must be approved/);
  settings.approvedVnext6Vars = additions;
  assert.throws(() => checker.verify(config, version, settings), /secret binding/);
  version.resources.bindings.push(...["GOOGLE_CLIENT_SECRET", "CMS_GITHUB_APP_KEY"].map(
    (name) => ({ name, type: "secret_text" }),
  ));
  assert.equal(checker.verify(config, version, settings).secretsVerifiedByName, 4);
});
