import test from "node:test";
import assert from "node:assert/strict";
import { createCmsReader } from "../src/cms-read.mjs";

test("a write rechecks main and reuses immutable files only when the SHA matches", async () => {
  const first = "a".repeat(40);
  const second = "b".repeat(40);
  let main = first;
  let fileReads = 0;
  let refReads = 0;
  const snapshot = createCmsReader(async (url) => {
    if (url.endsWith("/git/ref/heads/main")) {
      refReads++;
      return Response.json({ object: { sha: main } });
    }
    fileReads++;
    return Response.json({ url });
  });

  const base = await snapshot();
  const baselineReads = fileReads;
  assert.ok(baselineReads > 0);
  assert.equal(await snapshot({ revalidate: true }), base);
  assert.equal(fileReads, baselineReads);
  assert.equal(refReads, 2);

  main = second;
  assert.equal((await snapshot()).sha, first);
  const updated = await snapshot({ revalidate: true });
  assert.equal(updated.sha, second);
  assert.equal(refReads, 3);
  assert.equal(fileReads, baselineReads * 2);
  assert.match(updated.models.goods.url, new RegExp(second));
});
