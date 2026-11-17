import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export async function workspaceBrowser({
  browser,
  base,
  models,
  reset,
  shotDir,
}) {
  const measurements = [];
  for (const width of [320, 390, 768, 1440, 1920]) {
    reset();
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: width === 768 ? "dark" : "light",
    });
    context.on("dialog", (d) => d.accept());
    await context.route(
      /^https:\/\/github\.com\/login\/oauth\/authorize/,
      async (r) => {
        const u = new URL(r.request().url());
        await r.fulfill({
          status: 302,
          headers: {
            location:
              base +
              "/auth/callback?code=fixture&state=" +
              u.searchParams.get("state"),
          },
        });
      },
    );
    const p = await context.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const click = (name) =>
      p.getByRole("button", { name, exact: true }).click();
    const saved = () =>
      p
        .locator("#workspace-bar [data-save-state]")
        .filter({ hasText: /^保存済み/ })
        .waitFor();
    const login = async () => {
      await p.goto(base);
      await p
        .getByRole("link", { name: "GitHubでログイン", exact: true })
        .click();
      await saved();
    };
    const nav = async (name) => {
      await p.getByRole("link", { name, exact: true }).first().click();
    };
    await login();
    await nav("記念日");
    const original = models.anniversaries.events[0];
    await p.getByRole("button", { name: original.title, exact: true }).click();
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill(original.title + " workspace");
    await click("下書きを保存");
    await saved();
    await nav("音楽");
    await click("新規楽曲登録");
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill("未完成の楽曲 workspace");
    // Incomplete data is saved as an unchecked draft, never a published Song.
    await p
      .locator("#workspace-bar [data-save-state]")
      .filter({ hasText: /未保存/ })
      .waitFor();
    await saved(); // idle autosave
    await nav("変更内容");
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 2);
    await p.reload();
    await saved();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 2);
    await click("ログアウト");
    await p
      .getByRole("link", { name: "GitHubでログイン", exact: true })
      .waitFor();
    await login();
    await nav("変更内容");
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 2);
    await p
      .getByRole("button", { name: "下書きから除外", exact: true })
      .last()
      .click();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 1);
    await click("元に戻す");
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 2);
    await click("やり直す");
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 1);
    await click("下書きを保存");
    await saved();
    await p.getByRole("button", { name: "編集を再開", exact: true }).click();
    await p.getByLabel("タイトル（必須）", { exact: true }).waitFor();
    assert.equal(
      await p.getByLabel("タイトル（必須）", { exact: true }).inputValue(),
      original.title + " workspace",
    );
    await p.route("**/api/workspace", (r) =>
      r.request().method() === "PUT"
        ? r.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":"temporary_failure"}',
          })
        : r.continue(),
    );
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill(original.title + " recovered");
    await click("下書きを保存");
    await p.locator('[data-save-state][data-state="failed"]').waitFor();
    assert.equal(
      await p.getByLabel("タイトル（必須）", { exact: true }).inputValue(),
      original.title + " recovered",
    );
    await p.unroute("**/api/workspace");
    await click("下書きを保存");
    await saved();
    const second = await context.newPage();
    await second.goto(base + "/#workspace");
    await second.locator('[data-save-state][data-state="saved"]').waitFor();
    await p
      .getByLabel("タイトル（必須）", { exact: true })
      .fill(original.title + " first tab");
    await click("下書きを保存");
    await saved();
    await second
      .getByRole("button", { name: "編集を再開", exact: true })
      .click();
    await second
      .getByLabel("タイトル（必須）", { exact: true })
      .fill(original.title + " second tab");
    await second
      .getByRole("button", { name: "下書きを保存", exact: true })
      .click();
    await second.locator('[data-save-state][data-state="conflict"]').waitFor();
    assert.equal(
      await second.getByLabel("タイトル（必須）", { exact: true }).inputValue(),
      original.title + " second tab",
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (shotDir && [390, 1440, 1920].includes(width)) {
      fs.mkdirSync(shotDir, { recursive: true });
      await p.screenshot({
        path: path.join(shotDir, `workspace-editor-${width}.png`),
        fullPage: true,
      });
      await nav("変更内容");
      await p
        .getByRole("heading", { name: "変更ワークスペース", exact: true })
        .waitFor();
      await p.screenshot({
        path: path.join(shotDir, `workspace-changes-${width}.png`),
        fullPage: true,
      });
    }
    // Seed 20 incomplete mixed-category drafts through the real authenticated API, not a master mutation.
    const seeded = await p.evaluate(async () => {
      const me = await (await fetch("/api/me")).json();
      const saved = await (await fetch("/api/workspace")).json();
      const operations = Array.from({ length: 20 }, (_, i) => ({
        key: "density-" + i,
        entity: i % 2 ? "campaign" : "organization",
        baseCommit: "main-sha",
        before: null,
        value:
          i % 2
            ? { title: "表示密度テスト " + i, visibility: "draft" }
            : { name: "表示密度テスト " + i },
      }));
      const r = await fetch("/api/workspace", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrf,
        },
        body: JSON.stringify({
          protocol: 1,
          revision: saved.workspace.revision,
          operations,
        }),
      });
      return r.status;
    });
    assert.equal(seeded, 200);
    await p.goto(base + "/#workspace");
    await p.reload();
    await saved();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 20);
    measurements.push(
      await p.evaluate(() => ({
        width: innerWidth,
        mainWidth: document.querySelector("main").getBoundingClientRect().width,
        visibleRows: [...document.querySelectorAll("#view table[data-workspace-operations] > tbody > tr")].filter(
          (r) => r.getBoundingClientRect().bottom <= innerHeight,
        ).length,
        rowHeight: document
          .querySelector("#view table[data-workspace-operations] > tbody > tr")
          .getBoundingClientRect().height,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      })),
    );
    if (shotDir && [390, 1440, 1920].includes(width))
      await p.screenshot({
        path: path.join(shotDir, `workspace-20-${width}.png`),
      });
    await nav("VTuber");
    const person = models.talents.talents[0];
    await p
      .getByRole("button", { name: person.displayName, exact: true })
      .click();
    await click("編集");
    await p
      .getByLabel("表示名", { exact: true })
      .fill(person.displayName + " 保存テスト");
    await click("下書きを保存");
    await saved();
    await nav("変更内容");
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(await p.locator("#view table[data-workspace-operations] > tbody > tr").count(), 21);
    await p
      .locator("#view table[data-workspace-operations] > tbody > tr")
      .filter({ hasText: person.displayName + " 保存テスト" })
      .getByRole("button", { name: "編集を再開", exact: true })
      .click();
    assert.equal(
      await p.getByLabel("表示名", { exact: true }).inputValue(),
      person.displayName + " 保存テスト",
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Workspace persistence/recovery/CAS E2E passed", width);
  }
  if (shotDir)
    fs.writeFileSync(
      path.join(shotDir, "measurements.json"),
      JSON.stringify(measurements, null, 2) + "\n",
    );
}
