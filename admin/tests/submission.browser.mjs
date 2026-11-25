import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export async function submissionBrowser({
  browser,
  base,
  models,
  reset,
  advance,
  reject,
  shotDir,
}) {
  for (const width of [320, 390, 768, 1440, 1920]) {
    reset();
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: width === 768 ? "dark" : "light",
    });
    context.on("dialog", (d) => d.accept());
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    await p
      .getByRole("link", { name: "GitHubでログイン", exact: true })
      .click();
    await p.locator("#identity").filter({ hasText: "管理者" }).waitFor();
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#workspace"]').click();
    await p.locator('[data-save-state][data-state="saved"]').waitFor();
    const ops = Array.from({ length: 20 }, (_, i) => {
      if (i < 10) {
        const entity = i < 5 ? "talent" : "anniversary",
          file = i < 5 ? "talents" : "anniversaries",
          list = i < 5 ? "talents" : "events",
          r = structuredClone(models[file][list][i % 5]),
          value = structuredClone(r);
        if (i < 5) value.displayName += " P2";
        else value.title += " P2";
        return {
          key: entity + "-" + i,
          entity,
          id: r.id,
          baseCommit: "main-sha",
          before: r,
          value,
        };
      }
      return {
        key: "campaign-" + i,
        entity: "campaign",
        baseCommit: "main-sha",
        before: null,
        value: { title: "P2 campaign " + i, visibility: "draft" },
      };
    });
    assert.equal(
      await p.evaluate(async (operations) => {
        const me = await (await fetch("/api/me")).json();
        return (
          await fetch("/api/workspace", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": me.csrf,
            },
            body: JSON.stringify({ protocol: 1, revision: 0, operations }),
          })
        ).status;
      }, ops),
      200,
    );
    await p.goto(base + "/#workspace");
    await p.reload();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(
      await p.locator("[data-workspace-operations] > tbody > tr").count(),
      20,
    );
    const first = p
      .locator("[data-workspace-operations] input[type=checkbox]")
      .first();
    await first.focus();
    await p.keyboard.press("Space");
    assert.equal(await first.isChecked(), false);
    await p.keyboard.press("Space");
    assert.equal(await first.isChecked(), true);
    const count = width < 1000 ? 5 : 20;
    if (count === 5) {
      await p.getByRole("button", { name: "選択解除", exact: true }).click();
      await p
        .getByRole("button", { name: "VTuberを選択", exact: true })
        .click();
    }
    assert.equal(
      await p.getByLabel("変更理由", { exact: true }).inputValue(),
      "",
    );
    if (shotDir && [390, 768, 1440, 1920].includes(width)) {
      fs.mkdirSync(shotDir, { recursive: true });
      await p.screenshot({
        path: path.join(shotDir, `selection-${width}.png`),
      });
    }
    await p
      .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(await p.locator(".error-summary").count(), 0);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (shotDir && [390, 768, 1440].includes(width))
      await p.screenshot({ path: path.join(shotDir, `review-${width}.png`) });
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    reject();
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p.locator("[data-submission-error]").waitFor();
    assert.equal(
      await p.evaluate(async () => {
        const r = await (await fetch("/api/workspace")).json();
        return r.workspace.operations.length;
      }),
      20,
    );
    await p
      .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "PRを作成しました", exact: true })
      .waitFor();
    await p
      .locator('nav a[href="#workspace"]')
      .first()
      .click();
    await p
      .getByRole("heading", { name: "変更ワークスペース", exact: true })
      .waitFor();
    assert.equal(
      await p.locator("[data-workspace-operations] > tbody > tr").count(),
      20 - count,
    );
    await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
    await p.locator('nav a[href="#submitted"]').click();
    await p.getByRole("button", { name: "PR詳細", exact: true }).click();
    await p.getByRole("heading", { name: "PR詳細", exact: true }).waitFor();
    assert.match(await p.locator("#view").innerText(), /CI成功/);
    const unavailable = /\/api\/submissions\/[\w-]{43}\?refresh=1$/;
    await p.route(unavailable, (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"temporary_failure"}',
      }),
    );
    await p.getByRole("button", { name: "状態を更新", exact: true }).click();
    await p.locator("[data-submission-error]").waitFor();
    assert(
      !(await p
        .locator("[data-pr-state]")
        .filter({ hasText: "マージ可能" })
        .count()),
    );
    await p.unroute(unavailable);
    await p.getByRole("button", { name: "状態を更新", exact: true }).click();
    await p.locator("[data-pr-state]").filter({ hasText: "CI成功" }).waitFor();

    if (shotDir && [390, 768, 1440].includes(width))
      await p.screenshot({
        path: path.join(shotDir, `submitted-${width}.png`),
      });
    advance(false);
    await p
      .getByRole("button", {
        name: "最新mainに更新する差分を確認",
        exact: true,
      })
      .click();
    await p
      .getByRole("heading", { name: "変更プレビュー", exact: true })
      .waitFor();
    await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
    await p
      .getByRole("button", { name: "確認した変更でPRを更新", exact: true })
      .click();
    await p
      .getByRole("heading", { name: "PRを更新しました", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "Submission mixed/partial/retry/CI/safe-update E2E passed",
      width,
      count,
    );
  }
  // Same-field collision, explicit choice and a new preview; no conflicting operation is silently discarded.
  reset();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  context.on("dialog", (d) => d.accept());
  const p = await context.newPage();
  await p.goto(base);
  await p.getByRole("link", { name: "GitHubでログイン", exact: true }).click();
  await p.locator("#identity").filter({ hasText: "管理者" }).waitFor();
  await p.locator("nav details[data-owner-only]").evaluate((node) => { node.open = true; });
  await p.locator('nav a[href="#workspace"]').click();
  await p.locator('[data-save-state][data-state="saved"]').waitFor();
  const r = structuredClone(models.talents.talents[0]),
    value = { ...r, displayName: r.displayName + " ours" };
  await p.evaluate(
    async ({ before, value }) => {
      const me = await (await fetch("/api/me")).json();
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrf,
        },
        body: JSON.stringify({
          protocol: 1,
          revision: 0,
          operations: [
            {
              key: "conflict-one",
              entity: "talent",
              id: before.id,
              baseCommit: "main-sha",
              before,
              value,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error("save failed");
    },
    { before: r, value },
  );
  advance(true);
  await p.goto(base + "/#workspace");
  await p.reload();
  await p
    .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "競合を解決してください", exact: true })
    .waitFor();
  if (shotDir)
    await p.screenshot({ path: path.join(shotDir, "conflict-1440.png") });
  await p
    .getByRole("combobox", {
      name: "conflict-one /displayNameで採用する値",
      exact: true,
    })
    .selectOption("ours");
  await p
    .getByRole("button", { name: "選択内容を下書きへ保存", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "変更ワークスペース", exact: true })
    .waitFor();
  await p
    .getByRole("button", { name: "選択した変更をプレビュー", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "変更プレビュー", exact: true })
    .waitFor();
  await p.getByLabel("差分と参照影響を確認しました", { exact: true }).check();
  await p
    .getByRole("button", { name: "確認した変更でPRを作成", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "PRを作成しました", exact: true })
    .waitFor();
  await context.close();
  console.log("Submission conflict resolution/re-preview E2E passed");
}
