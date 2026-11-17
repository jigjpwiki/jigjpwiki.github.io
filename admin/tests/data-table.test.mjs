import { formatJst } from "../public/table-columns.js";
import { overlayRows } from "../public/table-columns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { tableRows, changedValue } from "../public/data-table.js";
import {
  anniversaryDate,
  column,
  columnsFor,
} from "../public/table-columns.js";
const columns = [
  column("name", "名称"),
  column("visibility", "公開状態", {
    options: [
      ["public", "公開"],
      ["draft", "非公開"],
    ],
  }),
];
test("DataTable combines normalized query, filters, stable Japanese/numeric sort without changing rows", () => {
  const rows = [
      { id: "a", name: "Ａ１０", visibility: "public" },
      { id: "b", name: "A2", visibility: "public" },
      { id: "c", name: "A1", visibility: "draft" },
    ],
    before = structuredClone(rows);
  assert.deepEqual(
    tableRows(rows, columns, {
      query: "a",
      filters: { visibility: "public" },
      sort: "name",
    }).map((r) => r.id),
    ["b", "a"],
  );
  assert.deepEqual(
    tableRows(rows, columns, { sort: "name", descending: true }).map(
      (r) => r.id,
    ),
    ["a", "b", "c"],
  );
  assert.deepEqual(rows, before);
});
test("cell changes touch only the chosen field and refuse unknown enum", () => {
  const record = { name: "名前", visibility: "public", other: { v: 1 } },
    next = changedValue(record, columns[1], "draft");
  assert.deepEqual(next, { ...record, visibility: "draft" });
  assert.equal(record.visibility, "public");
  assert.throws(() => changedValue(record, columns[1], "ended"));
});
test("anniversary date never invents a year and verifies February 29 and invalid days", () => {
  assert.deepEqual(anniversaryDate("02-29"), { year: null, month: 2, day: 29 });
  assert.deepEqual(anniversaryDate("2024-02-29"), {
    year: 2024,
    month: 2,
    day: 29,
  });
  for (const raw of ["2025-02-29", "13-01", "04-31", "2026/01/01", ""])
    assert.throws(() => anniversaryDate(raw));
});
test("talent activity, agency and visibility are independent; no automatic state inference", () => {
  const r = {
      id: "tal-000001",
      displayName: "人",
      agencyStatus: { value: "unknown" },
      activityStatus: { value: "unknown" },
      visibility: "public",
      accounts: [],
      affiliations: [],
    },
    cols = columnsFor("talent", {
      models: { talents: { talents: [r], organizations: [] } },
    }),
    next = changedValue(
      r,
      cols.find((c) => c.key === "activity"),
      "ended",
    );
  assert.equal(next.agencyStatus.value, "unknown");
  assert.equal(next.visibility, "public");
  assert.equal(next.activityStatus.value, "ended");
});

test("unissued records have independent temporary references and preserve existing rows", () => {
  const records = [{ id: "tal-000001", displayName: "既存" }],
    operations = [
      { key: "one", entity: "talent", value: { displayName: "新規1" } },
      { key: "two", entity: "talent", value: { displayName: "新規2" } },
      { key: "three", entity: "organization", value: { name: "別型" } },
    ];
  const projected = overlayRows(records, operations, "talent");
  assert.equal(projected.length, 3);
  assert.deepEqual(
    projected.map((r) => r._reference),
    ["tal-000001", "@one", "@two"],
  );
  assert.equal(projected[1].displayName, "新規1");
  assert.deepEqual(records, [{ id: "tal-000001", displayName: "既存" }]);
});

test("incomplete event timestamps remain unknown and valid instants display in JST", () => {
  assert.equal(formatJst(""), "未登録・不明");
  assert.equal(formatJst("bad"), "日時未入力・要確認");
  assert.match(formatJst("2026-11-17T00:00:00Z"), /9:00/);
  assert.deepEqual(anniversaryDate("0001-01-01"), {
    year: 1,
    month: 1,
    day: 1,
  });
});
