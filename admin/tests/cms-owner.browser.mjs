import assert from "node:assert/strict";

export async function cmsOwnerBrowser({ browser, base, mainSha }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole("link", { name: "GitHubでログイン", exact: true }).click();
    await page.waitForURL("**/#dashboard");
    const reviewLink = page.getByRole("link", { name: "下書きを確認して公開申請", exact: true });
    await page.getByRole("link", { name: "下書き", exact: true }).waitFor();
    const existingOperation = {
      key: "existing-advanced-draft", entity: "organization",
      baseCommit: mainSha, before: null, value: { name: "既存の高度な管理下書き" },
    };
    const seed = await page.evaluate(async (operation) => {
      const me = await (await fetch("/api/me")).json();
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": me.csrf },
        body: JSON.stringify({ protocol: 1, revision: 0, operations: [operation] }),
      });
      return response.status;
    }, existingOperation);
    assert.equal(seed, 200);
    await page.goto(base + "/#content/campaign");
    const campaignButton = page.getByRole("button", { name: "キャンペーンを新規登録", exact: true });
    await campaignButton.click();
    const name = page.getByLabel("名称", { exact: true });
    await name.fill("未保存の企画名");
    const confirmation = new Promise((resolve) => page.once("dialog", async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      resolve(message);
    }));
    await page.getByRole("link", { name: "下書き", exact: true }).click();
    assert.match(await confirmation, /保存していない入力を破棄/);
    await page.waitForURL("**/#content/campaign");
    assert.equal(await name.inputValue(), "未保存の企画名");

    await page.getByLabel("商品名", { exact: true }).fill("一括公開申請の商品");
    await page.getByLabel("公式商品情報URL").fill("https://example.com/owner-product");
    const person = page.getByRole("combobox", { name: "関連する人物", exact: true });
    await person.selectOption({ index: 1 });
    await page.getByLabel("販売ページURL", { exact: true }).fill("https://example.com/owner-sale");
    await page.locator("#view").getByRole("button", { name: "下書きを保存", exact: true }).click();
    await page.getByText("下書きを保存しました。公開サイトには反映されていません。").waitFor();
    await page.goto(base + "/#content/video");
    await page.getByRole("button", { name: "動画情報を新規登録", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "関連する人物", exact: true }).count(), 0);
    assert.ok(await page.getByLabel("YouTube動画URL", { exact: true }).isVisible());

    const songTitle = "新規のオリジナル楽曲";
    const songUrl = "https://example.com/original-song";
    await page.goto(base + "/#content/song");
    await page.getByRole("button", { name: "楽曲を新規登録", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "関連する人物", exact: true }).count(), 0);
    await page.getByLabel("名称", { exact: true }).fill(songTitle);
    await page.getByLabel("原曲アーティスト（1行に1名）", { exact: true }).fill("作者");
    await page.getByLabel("楽曲の公式情報URL", { exact: true }).fill(songUrl);
    await page.getByLabel("曲の別名（1行に1件）", { exact: true }).fill("別タイトル");
    await page.locator("#view").getByRole("button", { name: "下書きを保存", exact: true }).click();
    await page.getByRole("link", { name: "下書き", exact: true }).click();
    const savedSong = page.getByRole("button", { name: songTitle, exact: true });
    await savedSong.click();
    assert.equal(await page.getByLabel("楽曲の公式情報URL", { exact: true }).inputValue(), songUrl);
    let releaseWorkspace;
    const workspaceGate = new Promise((resolve) => { releaseWorkspace = resolve; });
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() === "GET") await workspaceGate;
      await route.continue();
    });
    try {
      await reviewLink.click();
      await page.waitForURL("**/#workspace");
    } finally {
      releaseWorkspace();
    }
    await page.waitForURL("**/#workspace");
    const workspaceTable = page.locator("table[data-workspace-operations]");
    await workspaceTable.waitFor();
    assert.match(await workspaceTable.textContent(), /既存の高度な管理下書き/);
    assert.match(await workspaceTable.textContent(), /未保存の企画名/);
    assert.equal(await workspaceTable.locator("tbody tr").count(), 5);
    const operations = await page.evaluate(async () => (await (await fetch("/api/workspace")).json()).workspace.operations);
    const preserved = operations.find(({ key }) => key === existingOperation.key);
    assert.equal(preserved.value.name, existingOperation.value.name);
    assert.deepEqual(operations.map(({ entity }) => entity), ["organization", "campaign", "product", "offer", "song"]);
    assert.equal(operations.at(-1).value.title, songTitle);
    assert.deepEqual(operations.at(-1).value.aliases, ["別タイトル"]);
  } finally {
    await context.close();
  }
}
