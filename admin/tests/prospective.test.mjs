import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { snapshot, campaign, op } from "./content-fixtures.mjs";
import { planSubmission } from "../src/submission-plan.mjs";
import { filePath } from "../src/github.mjs";
import { hash } from "../src/security.mjs";
test("legitimate mixed Admin output passes current master validation and historical review/rule tests without rewriting review hashes", async () => {
  const root = path.resolve(import.meta.dirname, "../.."),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "jigwiki-prospective-")),
    s = snapshot({ current: true });
  try {
    for (const dir of [
      "lib",
      "scripts",
      "schemas",
      "tests",
      "data",
      "ops",
      "docs",
      "pages",
      ".github",
      "privacy-policy",
      "terms",
    ])
      fs.cpSync(path.join(root, dir), path.join(temp, dir), {
        recursive: true,
      });
    for (const name of execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter((n) => n && !n.includes("/")))
      if (fs.existsSync(path.join(root, name)))
        fs.copyFileSync(path.join(root, name), path.join(temp, name));
    fs.mkdirSync(path.join(temp, "admin/src"), { recursive: true });
    fs.cpSync(path.join(root,"admin/public"),path.join(temp,"admin/public"),{recursive:true});
    fs.copyFileSync(path.join(root,"admin/package.json"),path.join(temp,"admin/package.json"));
    fs.copyFileSync(path.join(root,"admin/src/validate.cjs"),path.join(temp,"admin/src/validate.cjs"));
    fs.copyFileSync(
      path.join(root, "admin/src/audit.cjs"),
      path.join(temp, "admin/src/audit.cjs"),
    );
    fs.cpSync(path.join(root, "assets"), path.join(temp, "assets"), {
      recursive: true,
    });
    fs.symlinkSync(
      path.join(root, "node_modules"),
      path.join(temp, "node_modules"),
      "dir",
    );
    const operations = campaign().map((o) => ({
      ...o,
      baseCommit: s.sha,
      before: null,
    }));
    for (const i of [0, 4]) {
      const before = structuredClone(s.models.talents.talents[i]);
      operations.push({
        key: "talent-" + i,
        entity: "talent",
        id: before.id,
        baseCommit: s.sha,
        before,
        value: { ...before, displayName: before.displayName + " 正規編集",...(i===0?{visibility:"draft",historyNamePublic:true}:{}) },
      });
    }
    operations.push({
      ...op("song", "song", {
        title: "未確定の楽曲",
        originalArtists: null,
        identityUrl: null,
        identityStatus: "unresolved",
        visibility: "draft",
      }),
      baseCommit: s.sha,
      before: null,
    });
    operations.push({
      ...op("anniversary", "anniversary", {
        title: "テスト用記念日",
        type: "other",
        date: { year: null, month: 12, day: 31 },
        talentIds: [s.models.talents.talents[0].id],
        groupIds: [],
        recursYearly: true,
        countYears: false,
        visibility: "public",
      }),
      baseCommit: s.sha,
      before: null,
    });
    operations.push({
      ...op("event", "event", {
        title: "新規イベント",
        announcementUrl: "https://official.example/event",
        summary: "検証専用イベント",
        talentIds: [s.models.talents.talents[0].id],
        visibility: "public",
      }),
      baseCommit: s.sha,
      before: null,
    });
    for (const [entity, file, list, field] of [
      ["organization", "talents", "organizations", "name"],
      ["group", "catalog", "groups", "name"],
      ["anniversary", "anniversaries", "events", "title"],
      ["event", "events", "events", "title"],
      ["song", "music", "songs", "title"],
      ["video", "media", "videos", "title"],
      ["product", "goods", "products", "title"],
      ["campaign", "goods", "campaigns", "title"],
    ]) {
      const before = structuredClone(s.models[file][list][0]),
        id = entity === "video" ? before.youtubeId : before.id,
        value = { ...before, [field]: before[field] + " 正規更新" };
      operations.push({
        key: "live-" + entity,
        entity,
        id,
        baseCommit: s.sha,
        before,
        value,
      });
    }
    const plan = await planSubmission(s, operations, {
      actor: "123",
      batchId: await hash("prospective"),
    });
    for (const [name, value] of Object.entries(plan.files)) {
      const file = path.join(temp, filePath(name));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    }
    const env = { ...process.env, GITHUB_EVENT_PATH: "" };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["scripts/check.js"], {
      cwd: temp,
      env,
      stdio: "pipe",
      timeout: 60000,
    });
    const result = execFileSync(
      process.execPath,
      [
        "--test",
        ...fs
          .readdirSync(path.join(temp, "tests"))
          .filter((n) => n.endsWith(".test.js"))
          .map((n) => "tests/" + n),
      ],
      { cwd: temp, env, stdio: "pipe", timeout: 60000 },
    );
    assert.match(String(result), /(?:tests) [1-9]\d*/);
    const talentPath = path.join(temp, "data/talents.json"),
      valid = fs.readFileSync(talentPath, "utf8"),
      bad = JSON.parse(valid);
    bad.talents.push(structuredClone(bad.talents[0]));
    fs.writeFileSync(talentPath, JSON.stringify(bad));
    assert.throws(() =>
      execFileSync(process.execPath, ["scripts/check.js"], {
        cwd: temp,
        env,
        stdio: "pipe",
        timeout: 60000,
      }),
    );
    fs.writeFileSync(talentPath, valid);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(path.join(temp, "ops/official-discovery/review.json")),
      ),
      JSON.parse(
        fs.readFileSync(path.join(root, "ops/official-discovery/review.json")),
      ),
    );
  } catch (e) {
    if (e.stdout) console.error(String(e.stdout).slice(-6000));
    if (e.stderr) console.error(String(e.stderr).slice(-2000));
    throw e;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
